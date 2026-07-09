// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * LyricsPlugin residue — the paths the lyrics suite leaves open:
 *
 *  - auto-fetch through the REAL built-in LRC parser on `item` changes
 *  - the `getLyricsUrl` resolver override and the `autoFetch: false` gate
 *  - clearing state when the next track has no lyrics
 *  - fetch failure surfaces a warning event and resolves undefined (no throw)
 *  - unparseable URL surfaces the no-parser warning
 *  - plain text through the LRC parser degrades to an empty cue list
 */

import type { MusicPlaylistItem } from '../../types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NMMusicPlayer } from '../../index';
import { LyricsPlugin, lyricsPlugin } from '../../plugins/lyrics';

const TWO_CUE_LRC = '[00:01.00]Hello\n[00:02.00]World\n';
const PLAIN_TEXT_BODY = 'Just some liner notes.\nNo timestamps anywhere.\n';

function track(id: string, extra?: Partial<MusicPlaylistItem>): MusicPlaylistItem {
	return {
		id,
		name: `track ${id}`,
		...extra,
	};
}

function tick(): Promise<void> {
	return new Promise<void>(resolve => setTimeout(resolve, 0));
}

function requestUrl(input: RequestInfo | URL): string {
	if (input instanceof Request)
		return input.url;
	return String(input);
}

function lrcResponse(body: string): Response {
	return new Response(body, {
		status: 200,
		headers: { 'Content-Type': 'text/plain' },
	});
}

let idCounter = 0;

async function makePlayerWithLyrics(opts?: Record<string, unknown>): Promise<{ player: NMMusicPlayer; plugin: LyricsPlugin }> {
	idCounter += 1;
	const id = `lyrics-residue-${idCounter}`;
	const div = document.createElement('div');
	div.id = id;
	document.body.appendChild(div);

	const player = new NMMusicPlayer(id).setup({});
	player.addPlugin(lyricsPlugin, opts as any);
	await player.ready();

	const plugin = player.getPlugin(LyricsPlugin);
	if (!plugin)
		throw new Error('LyricsPlugin not registered');
	return {
		player,
		plugin,
	};
}

describe('LyricsPlugin residue', () => {
	beforeEach(() => {
		(NMMusicPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
	});

	afterEach(() => {
		(NMMusicPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		document.body.innerHTML = '';
		vi.restoreAllMocks();
	});

	// ── Auto-fetch via the real built-in LRC parser ───────────────────────────

	describe('auto-fetch on item change', () => {
		it('resolves item.lyricsUrl, fetches, and parses through the built-in LRC parser', async () => {
			const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(lrcResponse(TWO_CUE_LRC));
			const { player, plugin } = await makePlayerWithLyrics();

			player.queue([track('a', { lyricsUrl: 'https://example.com/a.lrc' })]);
			player.item('a');
			await tick();

			expect(fetchSpy).toHaveBeenCalledTimes(1);
			expect(requestUrl(fetchSpy.mock.calls[0]![0])).toContain('https://example.com/a.lrc');
			expect(plugin.all()).toHaveLength(2);
			expect(plugin.all()[0]!.payload.text).toBe('Hello');

			player.emit('time' as any, { time: 1.5 } as any);
			expect(plugin.current()?.text).toBe('Hello');
		});

		it('prefers the getLyricsUrl resolver over item.lyricsUrl', async () => {
			const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(lrcResponse(TWO_CUE_LRC));
			const { player } = await makePlayerWithLyrics({
				getLyricsUrl: (item: MusicPlaylistItem) => `https://resolver.example/${item.id}.lrc`,
			});

			player.queue([track('a', { lyricsUrl: 'https://ignored.example/a.lrc' })]);
			player.item('a');
			await tick();

			expect(requestUrl(fetchSpy.mock.calls[0]![0])).toContain('https://resolver.example/a.lrc');
		});

		it('autoFetch: false leaves item changes alone', async () => {
			const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(lrcResponse(TWO_CUE_LRC));
			const { player, plugin } = await makePlayerWithLyrics({ autoFetch: false });

			player.queue([track('a', { lyricsUrl: 'https://example.com/a.lrc' })]);
			player.item('a');
			await tick();

			expect(fetchSpy).not.toHaveBeenCalled();
			expect(plugin.all()).toHaveLength(0);
		});

		it('clears loaded lyrics when the next item has no lyricsUrl', async () => {
			vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(lrcResponse(TWO_CUE_LRC));
			const { player, plugin } = await makePlayerWithLyrics();

			player.queue([
				track('a', { lyricsUrl: 'https://example.com/a.lrc' }),
				track('b'),
			]);
			player.item('a');
			await tick();
			expect(plugin.all()).toHaveLength(2);

			player.item('b');
			await tick();

			expect(plugin.all()).toHaveLength(0);
			expect(plugin.current()).toBeUndefined();
		});

		it('clears state for an item payload that is not a music item', async () => {
			vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(lrcResponse(TWO_CUE_LRC));
			const { player, plugin } = await makePlayerWithLyrics();

			player.queue([track('a', { lyricsUrl: 'https://example.com/a.lrc' })]);
			player.item('a');
			await tick();
			expect(plugin.all()).toHaveLength(2);

			player.emit('item' as any, { item: { id: 'nameless' }, index: 0 } as any);

			expect(plugin.all()).toHaveLength(0);
		});
	});

	// ── Failure paths ─────────────────────────────────────────────────────────

	describe('failure paths', () => {
		it('fetch failure resolves undefined, emits a warning event, and never throws', async () => {
			vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('network down'));
			const { player, plugin } = await makePlayerWithLyrics();

			const warnings: Array<{ error: { code: string } }> = [];
			player.on('warning' as any, (data: { error: { code: string } }) => { warnings.push(data); });

			await expect(plugin.fetchLyrics('https://example.com/broken.lrc')).resolves.toBeUndefined();

			expect(warnings.some(entry => entry.error.code === 'plugin:lyrics/fetch-failed')).toBe(true);
			expect(plugin.all()).toHaveLength(0);
		});

		it('an HTTP error status takes the same contained path', async () => {
			vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('gone', { status: 404 }));
			const { player, plugin } = await makePlayerWithLyrics();

			const warnings: Array<{ error: { code: string } }> = [];
			player.on('warning' as any, (data: { error: { code: string } }) => { warnings.push(data); });

			await expect(plugin.fetchLyrics('https://example.com/missing.lrc')).resolves.toBeUndefined();

			expect(warnings.some(entry => entry.error.code === 'plugin:lyrics/fetch-failed')).toBe(true);
		});

		it('a URL no registered parser accepts surfaces plugin:lyrics/no-parser', async () => {
			const fetchSpy = vi.spyOn(globalThis, 'fetch');
			const { player, plugin } = await makePlayerWithLyrics();

			const warnings: Array<{ error: { code: string } }> = [];
			player.on('warning' as any, (data: { error: { code: string } }) => { warnings.push(data); });

			await expect(plugin.fetchLyrics('https://example.com/lyrics.xyz')).resolves.toBeUndefined();

			expect(warnings.some(entry => entry.error.code === 'plugin:lyrics/no-parser')).toBe(true);
			expect(fetchSpy).not.toHaveBeenCalled();
		});
	});

	// ── Plain text through the LRC parser ─────────────────────────────────────

	describe('plain text fallback', () => {
		it('untimestamped plain text parses to an empty cue list instead of crashing', async () => {
			vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(lrcResponse(PLAIN_TEXT_BODY));
			const { player, plugin } = await makePlayerWithLyrics();

			const loadedCounts: number[] = [];
			player.on('plugin:lyrics:loaded' as any, (data: { count: number }) => { loadedCounts.push(data.count); });

			const list = await plugin.fetchLyrics('https://example.com/notes.lrc');

			expect(list).toBeDefined();
			expect(list!.cues).toHaveLength(0);
			expect(loadedCounts).toEqual([0]);
			expect(plugin.current()).toBeUndefined();
		});
	});
});
