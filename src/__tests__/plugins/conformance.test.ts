// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * Plugin conformance gate — runs every music plugin through
 * `describePlugin` imported from the core `/testing` subpath.
 *
 * Coverage:
 *   AutoAdvancePlugin   — lifecycle + advance() calls next()
 *   LyricsPlugin        — lifecycle + clear() / fetchLyrics() behavior
 *   MediaSessionPlugin  — lifecycle + getMetadata() music field mapping
 *   KeyHandlerPlugin    — lifecycle + music-specific key bindings present
 *   CastSenderPlugin    — lifecycle + isConnected() false before connect()
 *   V1MusicCompatPlugin — lifecycle + on-interceptor / method shims / dispose cleanup
 */

import type { CueList, ICueParser } from '@nomercy-entertainment/nomercy-player-core';
import { createCueList } from '@nomercy-entertainment/nomercy-player-core';
import {
	createStubPlayer,
	describePlugin,
} from '@nomercy-entertainment/nomercy-player-core/testing';
import { expect, it, vi } from 'vitest';
import { AutoAdvancePlugin } from '../../plugins/auto-advance';
import { CastSenderPlugin } from '../../plugins/cast-sender';
import { KeyHandlerPlugin } from '../../plugins/key-handler';
import { LyricsPlugin } from '../../plugins/lyrics';
import { MediaSessionPlugin } from '../../plugins/media-session';
import { V1MusicCompatPlugin } from '../../plugins/v1-compat';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Minimal stub LRC parser that maps [mm:ss.cc]text lines to 1-second cues. */
const stubLrcParser: ICueParser<{ text: string }> = {
	id: 'stub-lrc-conformance',
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

const TWO_CUE_LRC = '[00:01.00]Hello\n[00:02.00]World\n';

// ---------------------------------------------------------------------------
// AutoAdvancePlugin
// ---------------------------------------------------------------------------

describePlugin(AutoAdvancePlugin, (ctx) => {
	it('advance() calls next() on the player', async () => {
		const nextSpy = vi.spyOn(ctx.player, 'next').mockResolvedValue(undefined);
		await ctx.plugin.advance();
		expect(nextSpy).toHaveBeenCalledOnce();
	});

	it('enabled:false prevents onEnded from advancing', async () => {
		const nextSpy = vi.spyOn(ctx.player, 'next').mockResolvedValue(undefined);
		ctx.plugin.options({ enabled: false });
		ctx.player.emit('ended', undefined as never);
		await new Promise<void>(resolve => setTimeout(resolve, 0));
		expect(nextSpy).not.toHaveBeenCalled();
	});

	it('enabled:true (default) triggers next() on ended event', async () => {
		const nextSpy = vi.spyOn(ctx.player, 'next').mockResolvedValue(undefined);
		ctx.player.emit('ended', undefined as never);
		await new Promise<void>(resolve => setTimeout(resolve, 0));
		expect(nextSpy).toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// LyricsPlugin
// ---------------------------------------------------------------------------

describePlugin(LyricsPlugin, (ctx) => {
	it('all() returns empty array before any lyrics are loaded', () => {
		expect(ctx.plugin.all()).toHaveLength(0);
	});

	it('current() returns undefined before any lyrics are loaded', () => {
		expect(ctx.plugin.current()).toBeUndefined();
	});

	it('clear() resets cue list and active cue', async () => {
		ctx.player.registerCueParser(stubLrcParser);
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
			new Response(TWO_CUE_LRC, { status: 200 }),
		);
		await ctx.plugin.fetchLyrics('https://example.com/track.lrc');
		expect(ctx.plugin.all().length).toBeGreaterThan(0);

		ctx.plugin.clear();
		expect(ctx.plugin.all()).toHaveLength(0);
		expect(ctx.plugin.current()).toBeUndefined();
		fetchSpy.mockRestore();
	});

	it('fetchLyrics() parses cues and emits plugin:lyrics:loaded with count', async () => {
		ctx.player.registerCueParser(stubLrcParser);

		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
			new Response(TWO_CUE_LRC, { status: 200 }),
		);

		let loadedPayload: { count: number } | undefined;
		ctx.player.once('plugin:lyrics:loaded' as never, (d: unknown) => {
			loadedPayload = d as { count: number };
		});

		await ctx.plugin.fetchLyrics('https://example.com/track.lrc');

		expect(loadedPayload).toBeDefined();
		expect(loadedPayload!.count).toBe(2);
		expect(ctx.plugin.all()).toHaveLength(2);

		fetchSpy.mockRestore();
	});

	it('current() returns active cue payload during cue window', async () => {
		ctx.player.registerCueParser(stubLrcParser);
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
			new Response(TWO_CUE_LRC, { status: 200 }),
		);

		await ctx.plugin.fetchLyrics('https://example.com/track.lrc');
		expect(ctx.plugin.current()).toBeUndefined();

		ctx.player.emit('time' as never, { time: 1.5 } as never);
		expect(ctx.plugin.current()?.text).toBe('Hello');

		ctx.player.emit('time' as never, { time: 3.5 } as never);
		expect(ctx.plugin.current()).toBeUndefined();

		fetchSpy.mockRestore();
	});
});

// ---------------------------------------------------------------------------
// MediaSessionPlugin (music subclass)
// ---------------------------------------------------------------------------

describePlugin(MediaSessionPlugin, (ctx) => {
	it('getMetadata() maps music item fields to title / artist / album', () => {
		const meta = (ctx.plugin as unknown as {
			getMetadata: (item: unknown) => { title: string; artist: string; album: string };
		}).getMetadata({
			id: 't1',
			name: 'Track Title',
			artist: 'The Artist',
			album: 'Great Album',
			cover: 'https://cdn/cover.jpg',
		});

		expect(meta.title).toBe('Track Title');
		expect(meta.artist).toBe('The Artist');
		expect(meta.album).toBe('Great Album');
	});

	it('getMetadata() returns empty strings for missing optional fields', () => {
		const meta = (ctx.plugin as unknown as {
			getMetadata: (item: unknown) => { title: string; artist: string; album: string };
		}).getMetadata({ id: 't2', name: 'Bare Track' });

		expect(meta.title).toBe('Bare Track');
		expect(meta.artist).toBe('');
		expect(meta.album).toBe('');
	});
});

// ---------------------------------------------------------------------------
// KeyHandlerPlugin (music subclass)
// ---------------------------------------------------------------------------

describePlugin(KeyHandlerPlugin, (ctx) => {
	it('installs kit default bindings: space / arrows / m', () => {
		const b = ctx.plugin.bindings();
		expect(b.has(' ')).toBe(true);
		expect(b.has('m')).toBe(true);
		expect(b.has('ArrowLeft')).toBe(true);
		expect(b.has('ArrowRight')).toBe(true);
		expect(b.has('ArrowUp')).toBe(true);
		expect(b.has('ArrowDown')).toBe(true);
	});

	it('installs music-specific bindings: n / p / r / s', () => {
		const b = ctx.plugin.bindings();
		expect(b.has('n')).toBe(true);
		expect(b.has('p')).toBe(true);
		expect(b.has('r')).toBe(true);
		expect(b.has('s')).toBe(true);
	});

	it('r binding calls repeatState setter with next cycle value', () => {
		const setStateSpy = vi.spyOn(ctx.player, 'repeatState');

		const b = ctx.plugin.bindings();
		const rHandler = b.get('r');
		if (!rHandler)
			throw new Error('r binding not found');

		rHandler(ctx.player as never);
		expect(setStateSpy).toHaveBeenCalledWith('all');
		setStateSpy.mockRestore();
	});
});

// ---------------------------------------------------------------------------
// CastSenderPlugin (music subclass)
// ---------------------------------------------------------------------------

describePlugin(CastSenderPlugin, (ctx) => {
	it('isConnected() returns false before connect()', () => {
		expect(ctx.plugin.isConnected()).toBe(false);
	});

	it('connect() rejects with BrowserPolicyError when Cast SDK is absent', async () => {
		const savedCast = (globalThis as Record<string, unknown>)['cast'];
		delete (globalThis as Record<string, unknown>)['cast'];

		try {
			await expect(ctx.plugin.connect()).rejects.toMatchObject({
				name: 'BrowserPolicyError',
				code: 'core:policy/castUnavailable',
			});
		}
		finally {
			if (savedCast !== undefined)
				(globalThis as Record<string, unknown>)['cast'] = savedCast;
		}
	});

	it('defaultContentType() is audio/mpeg for the music subclass', () => {
		const contentType = (ctx.plugin as unknown as { defaultContentType: () => string }).defaultContentType();
		expect(contentType).toBe('audio/mpeg');
	});
});

// ---------------------------------------------------------------------------
// V1MusicCompatPlugin
// ---------------------------------------------------------------------------

describePlugin(
	V1MusicCompatPlugin,
	(ctx) => {
		it('installs on() interceptor — v1 event name "song" bridged to v2 "item"', () => {
			const received: unknown[] = [];
			ctx.player.on('song' as never, (d: unknown) => { received.push(d); });

			const track = { id: 'a', name: 'Track A' };
			ctx.player.emit('item' as never, { item: track, index: 0 } as never);

			expect(received).toHaveLength(1);
			expect(received[0]).toMatchObject({ id: 'a', name: 'Track A' });
		});

		it('shims setVolume() to delegate to player.volume()', () => {
			const volumeSpy = vi.spyOn(ctx.player, 'volume').mockImplementation((_v?: number) => {});
			const setVolume = (ctx.player as unknown as Record<string, unknown>)['setVolume'];
			expect(setVolume).toBeTypeOf('function');
			(setVolume as (v: number) => void)(42);
			expect(volumeSpy).toHaveBeenCalledWith(42);
			volumeSpy.mockRestore();
		});

		it('shims getQueue() to delegate to player.queue()', () => {
			ctx.player.queue([{ id: 'x', url: '' } as never]);
			const getQueue = (ctx.player as unknown as Record<string, unknown>)['getQueue'];
			expect(getQueue).toBeTypeOf('function');
			const result = (getQueue as () => unknown)();
			expect(Array.isArray(result)).toBe(true);
		});

		it('shims isPlaying getter — returns false when playState is idle', () => {
			const isPlaying = (ctx.player as unknown as Record<string, unknown>)['isPlaying'];
			expect(isPlaying).toBe(false);
		});

		it('dispose() removes patched methods', () => {
			ctx.plugin.dispose();
			expect((ctx.player as unknown as Record<string, unknown>)['setVolume']).toBeUndefined();
			expect((ctx.player as unknown as Record<string, unknown>)['getQueue']).toBeUndefined();
		});
	},
	{
		createPlayer: () => {
			const p = createStubPlayer();
			const volumeFn = vi.fn((v?: number) => v === undefined ? 100 : undefined) as unknown as typeof p.volume;
			Object.defineProperty(p, 'volume', { value: volumeFn, writable: true, configurable: true });
			(p as unknown as Record<string, unknown>)['repeatState'] = vi.fn((s?: unknown) => s === undefined ? 'off' : undefined);
			(p as unknown as Record<string, unknown>)['shuffleState'] = vi.fn((s?: unknown) => s === undefined ? 'off' : undefined);
			(p as unknown as Record<string, unknown>)['playState'] = vi.fn(() => 'idle');
			(p as unknown as Record<string, unknown>)['duration'] = vi.fn(() => 0);
			(p as unknown as Record<string, unknown>)['time'] = vi.fn((t?: number) => t === undefined ? 0 : Promise.resolve());
			(p as unknown as Record<string, unknown>)['buffered'] = vi.fn(() => 0);
			(p as unknown as Record<string, unknown>)['timeData'] = vi.fn(() => ({ position: 0, duration: 0, buffered: 0, remaining: 0, percentage: 0 }));
			(p as unknown as Record<string, unknown>)['playbackRate'] = vi.fn((r?: number) => r === undefined ? 1 : undefined);
			(p as unknown as Record<string, unknown>)['volumeState'] = vi.fn(() => 'unmuted');
			const queueFn = vi.fn((items?: unknown) => items === undefined ? [] : undefined);
			Object.defineProperty(p, 'queue', { value: queueFn, writable: true, configurable: true });
			(p as unknown as Record<string, unknown>)['queueAppend'] = vi.fn();
			(p as unknown as Record<string, unknown>)['queuePrepend'] = vi.fn();
			(p as unknown as Record<string, unknown>)['queueRemove'] = vi.fn();
			(p as unknown as Record<string, unknown>)['backlog'] = vi.fn((items?: unknown) => items === undefined ? [] : undefined);
			(p as unknown as Record<string, unknown>)['backlogAppend'] = vi.fn();
			(p as unknown as Record<string, unknown>)['backlogRemove'] = vi.fn();
			(p as unknown as Record<string, unknown>)['item'] = vi.fn((i?: unknown) => i === undefined ? undefined : undefined);
			(p as unknown as Record<string, unknown>)['peekNext'] = vi.fn(() => undefined);
			(p as unknown as Record<string, unknown>)['play'] = vi.fn(() => Promise.resolve());
			(p as unknown as Record<string, unknown>)['mute'] = vi.fn();
			(p as unknown as Record<string, unknown>)['unmute'] = vi.fn();
			(p as unknown as Record<string, unknown>)['auth'] = vi.fn((c?: unknown) => c === undefined ? undefined : undefined);
			(p as unknown as Record<string, unknown>)['baseUrl'] = vi.fn((u?: string) => u === undefined ? undefined : undefined);
			(p as unknown as Record<string, unknown>)['crossfadeTo'] = vi.fn(() => Promise.resolve());
			(p as unknown as Record<string, unknown>)['audioContext'] = vi.fn(() => undefined);
			return p;
		},
		skipLeakAssertion: true,
	},
);
