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
 */

import type { CueList, ICueParser } from '@nomercy-entertainment/nomercy-player-core';
import type { MusicPlaylistItem } from '../../types';
import { createCueList } from '@nomercy-entertainment/nomercy-player-core';
import {
	describePlugin,
} from '@nomercy-entertainment/nomercy-player-core/testing';
import { expect, it, vi } from 'vitest';
import { AutoAdvancePlugin } from '../../plugins/auto-advance';
import { CastSenderPlugin } from '../../plugins/cast-sender';
import { KeyHandlerPlugin } from '../../plugins/key-handler';
import { LyricsPlugin } from '../../plugins/lyrics';
import { MediaSessionPlugin } from '../../plugins/media-session';

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
		ctx.player.once('plugin:lyrics:loaded' as never, (payload: unknown) => {
			loadedPayload = payload as { count: number };
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
		const bindings = ctx.plugin.bindings();
		expect(bindings.has(' ')).toBe(true);
		expect(bindings.has('m')).toBe(true);
		expect(bindings.has('ArrowLeft')).toBe(true);
		expect(bindings.has('ArrowRight')).toBe(true);
		expect(bindings.has('ArrowUp')).toBe(true);
		expect(bindings.has('ArrowDown')).toBe(true);
	});

	it('installs music-specific bindings: n / p / r / s', () => {
		const bindings = ctx.plugin.bindings();
		expect(bindings.has('n')).toBe(true);
		expect(bindings.has('p')).toBe(true);
		expect(bindings.has('r')).toBe(true);
		expect(bindings.has('s')).toBe(true);
	});

	it('r binding calls repeatState setter with next cycle value', () => {
		const setStateSpy = vi.spyOn(ctx.player, 'repeatState');

		const bindings = ctx.plugin.bindings();
		const rHandler = bindings.get('r');
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

	it('buildMetadata() resolves artwork from `image`, falling back to the deprecated `cover`', async () => {
		class GenericMediaMetadataCtor { title?: string; };
		const ctors = {
			MediaInfo: class { constructor(public contentId: string, public contentType: string) {} },
			LoadRequest: class { constructor(public media: unknown) {} },
			GenericMediaMetadata: GenericMediaMetadataCtor,
			StreamType: { BUFFERED: 'BUFFERED', LIVE: 'LIVE' },
		};
		const plugin = ctx.plugin as unknown as {
			buildMetadata: (item: MusicPlaylistItem, ctors: unknown) => Promise<Record<string, unknown>>;
		};

		const withImage = await plugin.buildMetadata({ id: 'i1', name: 'Song', image: 'https://cdn/image.jpg' }, ctors);
		expect((withImage['images'] as Array<{ url: string }>)[0]?.url).toBe('https://cdn/image.jpg');

		const withCoverOnly = await plugin.buildMetadata({ id: 'i2', name: 'Song', cover: 'https://cdn/cover.jpg' }, ctors);
		expect((withCoverOnly['images'] as Array<{ url: string }>)[0]?.url).toBe('https://cdn/cover.jpg');

		const withBoth = await plugin.buildMetadata(
			{ id: 'i3', name: 'Song', image: 'https://cdn/image.jpg', cover: 'https://cdn/cover.jpg' },
			ctors,
		);
		expect((withBoth['images'] as Array<{ url: string }>)[0]?.url).toBe('https://cdn/image.jpg');
	});
});
