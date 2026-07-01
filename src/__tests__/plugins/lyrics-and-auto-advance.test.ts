// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * Tests for `lyricsPlugin` and `autoAdvancePlugin`. Locks the registration
 * contract (use() runs without throwing) and the auto-advance master-toggle
 * behaviour. Lyrics fetching itself is exercised via the kit's cue helpers
 * and does not require a real network round-trip — when no `lyricsUrl` is
 * present the plugin is a no-op.
 *
 * Slice-09 additions:
 *  - LyricsPlugin line-entry / line-exit plugin events via CueTracker
 *  - LyricsPlugin.current() returns the active cue payload
 *  - AutoAdvancePlugin crossfade:true calls crossfadeTo() on itemEndingSoon
 */

import type { CueList, ICueParser } from '@nomercy-entertainment/nomercy-player-core';
import type { MusicPlaylistItem } from '../../types';
import { createCueList } from '@nomercy-entertainment/nomercy-player-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NMMusicPlayer } from '../../index';
import { AutoAdvancePlugin, autoAdvancePlugin } from '../../plugins/auto-advance';
import { LyricsPlugin, lyricsPlugin } from '../../plugins/lyrics';

function track(id: string, extra?: Partial<MusicPlaylistItem>): MusicPlaylistItem {
	return {
		id,
		name: `track ${id}`,
		...extra,
	};
}

/** Two-cue LRC text: cue 0 spans [1,2), cue 1 spans [2,3). */
const TWO_CUE_LRC = '[00:01.00]Hello\n[00:02.00]World\n';

/**
 * Minimal stub LRC parser. Parses `[MM:SS.cc]text` lines into cues where each
 * cue occupies a 1-second window.  Accepts any URL ending in `.lrc`.
 */
const stubLrcParser: ICueParser<{ text: string }> = {
	id: 'stub-lrc',
	canParse: (url: string) => url.endsWith('.lrc'),
	parse: (raw: string): CueList<{ text: string }> => {
		const cues = raw
			.trim()
			.split('\n')
			.map((line, index) => ({
				id: String(index),
				start: index + 1,
				end: index + 2,
				payload: { text: line.replace(/^\[.*?\]/u, '').trim() },
			}))
			.filter(cue => cue.payload.text.length > 0);
		return createCueList(cues);
	},
};

/** Build a player with the stub LRC parser pre-registered. */
function setupWithLrcParser(): NMMusicPlayer {
	return new NMMusicPlayer('test').setup({ cueParsers: [stubLrcParser] });
}

describe('NMMusicPlayer — lyrics + auto-advance plugins', () => {
	beforeEach(() => {
		(NMMusicPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		const div = document.createElement('div');
		div.id = 'test';
		document.body.appendChild(div);
	});

	afterEach(() => {
		(NMMusicPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		document.body.innerHTML = '';
	});

	const setup = (): NMMusicPlayer => new NMMusicPlayer('test').setup({});

	describe('lyricsPlugin', () => {
		it('registers and use() does not throw on a track without lyricsUrl', async () => {
			const musicPlayer = setup();
			expect(() => musicPlayer.addPlugin(lyricsPlugin)).not.toThrow();
			await musicPlayer.ready();
			const instance = musicPlayer.getPlugin(LyricsPlugin);
			expect(instance).toBeInstanceOf(LyricsPlugin);
			// Switching cursor to a track without `lyricsUrl` must be a silent no-op.
			musicPlayer.queue([track('a')]);
			expect(instance?.current()).toBeUndefined();
			expect(instance?.all().length).toBe(0);
		});

		it('emits plugin:lyrics:loaded with cue count after fetchLyrics() attaches a cue list', async () => {
			const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
				new Response(TWO_CUE_LRC, { status: 200, headers: { 'Content-Type': 'text/plain' } }),
			);

			const musicPlayer = setupWithLrcParser();
			musicPlayer.addPlugin(lyricsPlugin);
			await musicPlayer.ready();

			const loadedPayloads: Array<{ count: number }> = [];
			musicPlayer.on('plugin:lyrics:loaded' as any, (data: any) => loadedPayloads.push(data));

			const instance = musicPlayer.getPlugin(LyricsPlugin)!;
			await instance.fetchLyrics('https://example.com/track.lrc');

			expect(loadedPayloads).toHaveLength(1);
			expect(loadedPayloads[0]!.count).toBe(2);

			fetchSpy.mockRestore();
		});

		it('emits plugin:lyrics:lineEnter when a cue becomes active', async () => {
			const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
				new Response(TWO_CUE_LRC, { status: 200, headers: { 'Content-Type': 'text/plain' } }),
			);

			const musicPlayer = setupWithLrcParser();
			musicPlayer.addPlugin(lyricsPlugin);
			await musicPlayer.ready();

			const lineEnterPayloads: unknown[] = [];
			musicPlayer.on('plugin:lyrics:lineEnter' as any, (data: unknown) => { lineEnterPayloads.push(data); });

			const instance = musicPlayer.getPlugin(LyricsPlugin)!;
			await instance.fetchLyrics('https://example.com/track.lrc');

			// Cue 0 spans [1, 2). Advance past the start.
			musicPlayer.emit('time' as any, { time: 1.5 } as any);

			expect(lineEnterPayloads).toHaveLength(1);
			expect((lineEnterPayloads[0] as { text: string }).text).toBe('Hello');

			fetchSpy.mockRestore();
		});

		it('emits plugin:lyrics:lineExit when a cue becomes inactive', async () => {
			const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
				new Response(TWO_CUE_LRC, { status: 200, headers: { 'Content-Type': 'text/plain' } }),
			);

			const musicPlayer = setupWithLrcParser();
			musicPlayer.addPlugin(lyricsPlugin);
			await musicPlayer.ready();

			const lineExitPayloads: unknown[] = [];
			musicPlayer.on('plugin:lyrics:lineExit' as any, (data: unknown) => { lineExitPayloads.push(data); });

			const instance = musicPlayer.getPlugin(LyricsPlugin)!;
			await instance.fetchLyrics('https://example.com/track.lrc');

			// Enter cue 0 at t=1.5, then exit by advancing past end (t=2).
			musicPlayer.emit('time' as any, { time: 1.5 } as any);
			musicPlayer.emit('time' as any, { time: 2.5 } as any);

			expect(lineExitPayloads).toHaveLength(1);
			expect((lineExitPayloads[0] as { text: string }).text).toBe('Hello');

			fetchSpy.mockRestore();
		});

		it('current() returns the active cue payload during the cue window', async () => {
			const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
				new Response(TWO_CUE_LRC, { status: 200, headers: { 'Content-Type': 'text/plain' } }),
			);

			const musicPlayer = setupWithLrcParser();
			musicPlayer.addPlugin(lyricsPlugin);
			await musicPlayer.ready();

			const instance = musicPlayer.getPlugin(LyricsPlugin)!;
			await instance.fetchLyrics('https://example.com/track.lrc');

			expect(instance.current()).toBeUndefined();

			// Advance into cue 0 window [1, 2).
			musicPlayer.emit('time' as any, { time: 1.5 } as any);
			expect(instance.current()?.text).toBe('Hello');

			// Advance past both cues (cue 1 ends at t=3) into a gap.
			musicPlayer.emit('time' as any, { time: 3.5 } as any);
			// current() returns undefined when no cue is active.
			expect(instance.current()).toBeUndefined();

			fetchSpy.mockRestore();
		});
	});

	describe('autoAdvancePlugin', () => {
		it('registers and on `ended` advances to the next track', async () => {
			const musicPlayer = setup();
			musicPlayer.addPlugin(autoAdvancePlugin);
			await musicPlayer.ready();
			musicPlayer.queue([track('a'), track('b')]);
			expect(musicPlayer.item()?.id).toBe('a');

			let nextFired = false;
			musicPlayer.on('next' as any, () => { nextFired = true; });

			musicPlayer.emit('ended' as any, undefined as any);
			// `next()` runs through the dispatch pipeline asynchronously
			await new Promise<void>(resolve => setTimeout(resolve, 0));

			expect(nextFired).toBe(true);
		});

		it('options({ enabled: false }) prevents auto-advance', async () => {
			const musicPlayer = setup();
			musicPlayer.addPlugin(autoAdvancePlugin);
			await musicPlayer.ready();
			musicPlayer.queue([track('a'), track('b')]);

			const instance = musicPlayer.getPlugin(AutoAdvancePlugin);
			expect(instance).toBeInstanceOf(AutoAdvancePlugin);
			instance!.options({ enabled: false });

			let nextFired = false;
			musicPlayer.on('next' as any, () => { nextFired = true; });

			musicPlayer.emit('ended' as any, undefined as any);
			await new Promise<void>(resolve => setTimeout(resolve, 0));

			expect(nextFired).toBe(false);
		});

		it('advance() calls player.next() regardless of `enabled`', async () => {
			const musicPlayer = setup();
			musicPlayer.addPlugin(autoAdvancePlugin);
			await musicPlayer.ready();
			musicPlayer.queue([track('a', { url: 'blob:a' }), track('b', { url: 'blob:b' })]);

			const instance = musicPlayer.getPlugin(AutoAdvancePlugin);
			instance!.options({ enabled: false });

			let nextFired = false;
			musicPlayer.on('next' as any, () => { nextFired = true; });

			// advance() dispatches `next` before awaiting backend.load().
			// Don't await the full Promise — backend load hangs in happy-dom (no
			// media decoder). Yield one macrotask to flush the _dispatchBefore
			// microtask chain so the `next` event fires, then assert.
			void instance!.advance();
			await new Promise<void>(resolve => setTimeout(resolve, 0));

			expect(nextFired).toBe(true);
		});

		it('crossfade:true calls crossfadeTo() with next track on itemEndingSoon', async () => {
			const musicPlayer = setup();
			musicPlayer.addPlugin(autoAdvancePlugin);
			await musicPlayer.ready();

			const trackA = track('a');
			const trackB = track('b');
			musicPlayer.queue([trackA, trackB]);

			const instance = musicPlayer.getPlugin(AutoAdvancePlugin)!;
			instance.options({ crossfade: true, crossfadeDuration: 3 });

			// crossfadeTo is called by onItemEndingSoon, not onEnded.
			const crossfadeSpy = vi.spyOn(musicPlayer, 'crossfadeTo').mockResolvedValue(undefined);

			musicPlayer.emit('itemEndingSoon' as any, undefined as any);
			await new Promise<void>(resolve => setTimeout(resolve, 0));

			expect(crossfadeSpy).toHaveBeenCalledOnce();
			// First arg is the next track (trackB) — the second arg is options.
			const [calledWith] = crossfadeSpy.mock.calls[0]!;
			expect((calledWith as MusicPlaylistItem).id).toBe(trackB.id);
		});
	});
});
