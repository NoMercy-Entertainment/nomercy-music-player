/**
 * Tests for `lyricsPlugin` and `autoAdvancePlugin`. Locks the registration
 * contract (use() runs without throwing) and the auto-advance master-toggle
 * behaviour. Lyrics fetching itself is exercised via the kit's cue helpers
 * and does not require a real network round-trip — when no `lyricsUrl` is
 * present the plugin is a no-op.
 */

import type { CueList, ICueParser } from '@nomercy-entertainment/nomercy-player-core';
import type { MusicPlaylistItem } from '../../types';
import { createCueList } from '@nomercy-entertainment/nomercy-player-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NMMusicPlayer } from '../../index';
import { autoAdvancePlugin, AutoAdvancePlugin } from '../../plugins/auto-advance';
import { lyricsPlugin, LyricsPlugin } from '../../plugins/lyrics';

function track(id: string, extra?: Partial<MusicPlaylistItem>): MusicPlaylistItem {
	return {
		id,
		name: `track ${id}`,
		...extra,
	};
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
			const p = setup();
			expect(() => p.addPlugin(lyricsPlugin)).not.toThrow();
			await p.ready();
			const instance = p.getPlugin(LyricsPlugin);
			expect(instance).toBeInstanceOf(LyricsPlugin);
			// Switching cursor to a track without `lyricsUrl` must be a silent no-op.
			p.queue([track('a')]);
			expect(instance?.current()).toBeUndefined();
			expect(instance?.all().length).toBe(0);
		});

		it('emits plugin:lyrics:loaded with cue count after fetchLyrics() attaches a cue list', async () => {
			const lrcText = '[00:01.00]Hello\n[00:02.00]World\n';

			// Stub fetch so the kit auth pipeline returns the LRC text.
			const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
				new Response(lrcText, { status: 200, headers: { 'Content-Type': 'text/plain' } }),
			);

			// Register a minimal cue parser that accepts *.lrc URLs.
			const stubParser: ICueParser<{ text: string }> = {
				id: 'stub-lrc',
				canParse: (url: string) => url.endsWith('.lrc'),
				parse: (raw: string): CueList<{ text: string }> => {
					const cues = raw.trim().split('\n')
						.map((line, index) => ({
							id: String(index),
							start: index,
							end: index + 1,
							payload: { text: line.replace(/^\[.*?\]/u, '').trim() },
						}))
						.filter(cue => cue.payload.text.length > 0);
					return createCueList(cues);
				},
			};

			const p = new NMMusicPlayer('test').setup({ cueParsers: [stubParser] });
			p.addPlugin(lyricsPlugin);
			await p.ready();

			const loadedPayloads: Array<{ count: number }> = [];
			p.on('plugin:lyrics:loaded' as any, (data: any) => loadedPayloads.push(data));

			const instance = p.getPlugin(LyricsPlugin)!;
			await instance.fetchLyrics('https://example.com/track.lrc');

			expect(loadedPayloads).toHaveLength(1);
			expect(loadedPayloads[0]!.count).toBe(2);

			fetchSpy.mockRestore();
		});
	});

	describe('autoAdvancePlugin', () => {
		it('registers and on `ended` advances to the next track', async () => {
			const p = setup();
			p.addPlugin(autoAdvancePlugin);
			await p.ready();
			p.queue([track('a'), track('b')]);
			expect(p.item()?.id).toBe('a');

			let nextFired = false;
			p.on('next' as any, () => { nextFired = true; });

			p.emit('ended' as any, undefined as any);
			// `next()` runs through the dispatch pipeline asynchronously
			await new Promise<void>(resolve => setTimeout(resolve, 0));

			expect(nextFired).toBe(true);
		});

		it('options({ enabled: false }) prevents auto-advance', async () => {
			const p = setup();
			p.addPlugin(autoAdvancePlugin);
			await p.ready();
			p.queue([track('a'), track('b')]);

			const instance = p.getPlugin(AutoAdvancePlugin);
			expect(instance).toBeInstanceOf(AutoAdvancePlugin);
			instance!.options({ enabled: false });

			let nextFired = false;
			p.on('next' as any, () => { nextFired = true; });

			p.emit('ended' as any, undefined as any);
			await new Promise<void>(resolve => setTimeout(resolve, 0));

			expect(nextFired).toBe(false);
		});

		it('advance() calls player.next() regardless of `enabled`', async () => {
			const p = setup();
			p.addPlugin(autoAdvancePlugin);
			await p.ready();
			p.queue([track('a', { url: 'blob:a' }), track('b', { url: 'blob:b' })]);

			const instance = p.getPlugin(AutoAdvancePlugin);
			instance!.options({ enabled: false });

			let nextFired = false;
			p.on('next' as any, () => { nextFired = true; });

			// advance() dispatches `next` before awaiting backend.load().
			// Don't await the full Promise — backend load hangs in happy-dom (no
			// media decoder). Yield one macrotask to flush the _dispatchBefore
			// microtask chain so the `next` event fires, then assert.
			void instance!.advance();
			await new Promise<void>(resolve => setTimeout(resolve, 0));

			expect(nextFired).toBe(true);
		});
	});
});
