// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * `V1MusicCompatPlugin` — the legacy v1 method-surface shim for consumers
 * migrating to v2.
 *
 * Every shim must delegate to the REAL v2 API (verified through a factory-
 * injected backend so the whole `_wireBackend` path runs), log one deprecation
 * line per call, and stay strictly instance-scoped: the class prototype is
 * never touched, so players that don't opt in never see the legacy surface.
 */

import type { Translations } from '@nomercy-entertainment/nomercy-player-core';
import type { IAudioBackend } from '../../adapters/audio-backend/IAudioBackend';
import type { MusicPlaylistItem } from '../../types';
import { Plugin } from '@nomercy-entertainment/nomercy-player-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NMMusicPlayer } from '../../index';
import { V1MusicCompatPlugin } from '../../plugins/v1-compat';
import { VolumeState } from '../../types';

// ── Legacy surface type ───────────────────────────────────────────────────────
// The shim's module augmentation targets the published package specifier, which
// tests import via relative source paths — so the legacy methods are re-declared
// structurally here, mirroring the augmentation block in the shim source file.

interface LegacySurface {
	readonly isPlaying: boolean;
	seek: (seconds: number) => number;
	speed: {
		(): number;
		(rate: number): void;
	};
	speeds: () => number[];
	hasSpeeds: () => boolean;
	muted: {
		(): boolean;
		(state: boolean): void;
	};
	gain: () => number;
	state: () => string;
	currentTime: {
		(): number;
		(seconds: number): void;
	};
	currentTrack: () => MusicPlaylistItem | Record<string, never>;
	trackList: () => ReadonlyArray<MusicPlaylistItem>;
	nextTrack: () => Promise<void>;
	previousTrack: () => Promise<void>;
	playTrack: (target: MusicPlaylistItem | string | number) => void;
	playlist: {
		(): ReadonlyArray<MusicPlaylistItem>;
		(items: MusicPlaylistItem[]): void;
	};
	playlistItem: () => MusicPlaylistItem | Record<string, never>;
	playlistIndex: () => number;
	setPlaylist: (items: MusicPlaylistItem[]) => void;
	isFirstPlaylistItem: () => boolean;
	isLastPlaylistItem: () => boolean;
	hasPlaylists: () => boolean;
	localize: (key: string, vars?: Record<string, string>) => string;
	addTranslation: (key: string, value: string) => void;
	addTranslations: {
		(entries: ReadonlyArray<{ key: string; value: string }>): void;
		(bundle: Translations): void;
	};
	setTitle: (title: string) => void;
	registerPlugin: (PluginClass: any, opts?: unknown) => NMMusicPlayer;
	usePlugin: (PluginClass: any, opts?: unknown) => NMMusicPlayer;
	plugin: <P extends object = object>(id: string) => P | undefined;
	load: {
		(items: MusicPlaylistItem[]): void;
		(item: MusicPlaylistItem): Promise<void>;
	};
}

function legacy(player: NMMusicPlayer): LegacySurface {
	return player as unknown as LegacySurface;
}

// ── Mock backend ──────────────────────────────────────────────────────────────

interface MockBackendHarness {
	backend: IAudioBackend;
	element: HTMLAudioElement;
	/** Invoke every handler `_wireBackend` registered for `event`. */
	fire: (event: string, data?: unknown) => void;
}

function makeBackendHarness(): MockBackendHarness {
	const element = document.createElement('audio');
	const handlers = new Map<string, Array<(data?: unknown) => void>>();

	const backend: IAudioBackend = {
		kind: 'audio-element',
		load: vi.fn(() => Promise.resolve()),
		unload: vi.fn(),
		dispose: vi.fn(),
		play: vi.fn(() => Promise.resolve()),
		pause: vi.fn(),
		stop: vi.fn(),
		currentTime: vi.fn(() => 0) as any,
		duration: vi.fn(() => 0),
		buffered: vi.fn(() => 0),
		bufferedRanges: vi.fn(() => ({ length: 0 } as unknown as TimeRanges)),
		seekable: vi.fn(() => ({ length: 0 } as unknown as TimeRanges)),
		playbackRate: vi.fn(() => 1) as any,
		volume: vi.fn(() => 0.8) as any,
		mute: vi.fn(),
		unmute: vi.fn(),
		state: vi.fn(() => 'idle' as const),
		outputNode: vi.fn(() => ({} as AudioNode)),
		analyserSource: vi.fn(() => ({} as AudioNode)),
		mediaElement: vi.fn(() => element),
		captureStream: vi.fn(() => ({} as MediaStream)),
		setSinkId: vi.fn(() => Promise.resolve()),
		getSinkId: vi.fn(() => ''),
		mediaKeys: vi.fn(() => undefined),
		setMediaKeys: vi.fn(() => Promise.resolve()),
		outputProtectionState: vi.fn(() => 'unsupported' as const),
		pauseLoader: vi.fn(),
		resumeLoader: vi.fn(),
		loaderState: vi.fn(() => 'running' as const),
		on: vi.fn((event: string, fn: (data?: unknown) => void) => {
			const list = handlers.get(event) ?? [];
			list.push(fn);
			handlers.set(event, list);
		}) as any,
		off: vi.fn(),
		supportsCrossfade: vi.fn(() => true),
		loadSecondary: vi.fn(() => Promise.resolve()),
		disposeSecondary: vi.fn(),
		primeSecondary: vi.fn(() => Promise.resolve()),
		crossfade: vi.fn(() => Promise.resolve()),
		secondaryGain: vi.fn(() => 0) as any,
	};

	return {
		backend,
		element,
		fire: (event: string, data?: unknown) => {
			for (const fn of handlers.get(event) ?? []) {
				fn(data);
			}
		},
	};
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function track(id: string, extra?: Partial<MusicPlaylistItem>): MusicPlaylistItem {
	return {
		id,
		name: `track ${id}`,
		url: `blob:${id}`,
		...extra,
	};
}

function tick(): Promise<void> {
	return new Promise<void>(resolve => setTimeout(resolve, 0));
}

interface ShimmedSetup {
	player: NMMusicPlayer;
	shims: LegacySurface;
	harness: MockBackendHarness;
}

let idCounter = 0;

async function makeShimmedPlayer(): Promise<ShimmedSetup> {
	idCounter += 1;
	const id = `v1-shim-${idCounter}`;
	const div = document.createElement('div');
	div.id = id;
	document.body.appendChild(div);

	const harness = makeBackendHarness();
	const player = new NMMusicPlayer(id);
	player.setup({ backendFactory: () => harness.backend });
	player.addPlugin(V1MusicCompatPlugin);
	await player.ready();
	player.backend();

	return {
		player,
		shims: legacy(player),
		harness,
	};
}

// ── Fixture plugin for the lifecycle shims ────────────────────────────────────

class FixturePlugin extends Plugin<NMMusicPlayer> {
	static override readonly id: string = 'v1-shim-fixture';
	static override readonly description: string = 'registration target for the legacy plugin shims';
	usedFlag = false;

	override use(): void {
		this.usedFlag = true;
	}
}

describe('V1MusicCompatPlugin', () => {
	beforeEach(() => {
		(NMMusicPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
	});

	afterEach(() => {
		(NMMusicPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		document.body.innerHTML = '';
		document.title = '';
		vi.restoreAllMocks();
	});

	// ── Installation ──────────────────────────────────────────────────────────

	describe('installation', () => {
		it('use() installs every legacy method as an instance member', async () => {
			const { player, shims } = await makeShimmedPlayer();

			const methodNames: Array<keyof LegacySurface> = [
				'seek',
				'speed',
				'speeds',
				'hasSpeeds',
				'muted',
				'gain',
				'state',
				'currentTime',
				'currentTrack',
				'trackList',
				'nextTrack',
				'previousTrack',
				'playTrack',
				'playlist',
				'playlistItem',
				'playlistIndex',
				'setPlaylist',
				'isFirstPlaylistItem',
				'isLastPlaylistItem',
				'hasPlaylists',
				'localize',
				'addTranslation',
				'addTranslations',
				'setTitle',
				'registerPlugin',
				'usePlugin',
				'plugin',
				'load',
			];
			for (const name of methodNames) {
				expect(typeof shims[name], `player.${String(name)} should be installed`).toBe('function');
			}

			expect('isPlaying' in player).toBe(true);
			expect(shims.isPlaying).toBe(false);
		});

		it('never touches the NMMusicPlayer prototype — legacy names stay off it', async () => {
			await makeShimmedPlayer();

			const protoNames = Object.getOwnPropertyNames(NMMusicPlayer.prototype);
			const legacyOnly = [
				'seek',
				'speed',
				'speeds',
				'hasSpeeds',
				'muted',
				'gain',
				'currentTrack',
				'trackList',
				'nextTrack',
				'previousTrack',
				'playTrack',
				'playlistItem',
				'playlistIndex',
				'setPlaylist',
				'isFirstPlaylistItem',
				'isLastPlaylistItem',
				'hasPlaylists',
				'localize',
				'addTranslation',
				'setTitle',
				'registerPlugin',
				'usePlugin',
				'isPlaying',
			];
			for (const name of legacyOnly) {
				expect(protoNames, `${name} must not leak onto the prototype`).not.toContain(name);
			}
		});

		it('shadowed built-ins (load, addTranslations) become own instance properties', async () => {
			const { player } = await makeShimmedPlayer();

			expect(Object.hasOwn(player, 'load')).toBe(true);
			expect(Object.hasOwn(player, 'addTranslations')).toBe(true);
		});

		it('does not leak into a second player instance that never opted in', async () => {
			await makeShimmedPlayer();

			const div = document.createElement('div');
			div.id = 'v1-clean-instance';
			document.body.appendChild(div);
			const cleanPlayer = new NMMusicPlayer('v1-clean-instance').setup({});
			await cleanPlayer.ready();

			const cleanShims = cleanPlayer as unknown as Partial<LegacySurface>;
			expect(cleanShims.seek).toBeUndefined();
			expect(cleanShims.speeds).toBeUndefined();
			expect(cleanShims.playTrack).toBeUndefined();
			expect('isPlaying' in cleanPlayer).toBe(false);
			expect(Object.hasOwn(cleanPlayer, 'load')).toBe(false);
		});
	});

	// ── Transport shims ───────────────────────────────────────────────────────

	describe('transport shims', () => {
		it('seek(seconds) clamps to the known duration and forwards to time()', async () => {
			const { player, shims, harness } = await makeShimmedPlayer();

			player.emit('duration' as any, { duration: 100 } as any);
			expect(player.duration()).toBe(100);

			expect(shims.seek(150)).toBe(100);
			await tick();
			expect(harness.backend.currentTime).toHaveBeenCalledWith(100);
			expect(player.time()).toBe(100);
		});

		it('seek(seconds) clamps negative values to 0', async () => {
			const { player, shims } = await makeShimmedPlayer();

			player.emit('duration' as any, { duration: 100 } as any);
			expect(shims.seek(-10)).toBe(0);
			await tick();
			expect(player.time()).toBe(0);
		});

		it('seek(seconds) passes the raw value through when duration is unknown', async () => {
			const { player, shims } = await makeShimmedPlayer();

			expect(player.duration()).toBe(0);
			expect(shims.seek(42)).toBe(42);
			await tick();
			expect(player.time()).toBe(42);
		});

		it('speed() reads and speed(rate) writes the playback rate', async () => {
			const { player, shims, harness } = await makeShimmedPlayer();

			expect(shims.speed()).toBe(1);

			shims.speed(2);
			await tick();
			expect(player.playbackRate()).toBe(2);
			expect(shims.speed()).toBe(2);
			expect(harness.backend.playbackRate).toHaveBeenCalledWith(2);
		});

		it('speeds() returns playbackRates() and hasSpeeds() derives from its length', async () => {
			const { player, shims } = await makeShimmedPlayer();

			expect(shims.speeds()).toEqual(player.playbackRates());
			expect(shims.speeds().length).toBeGreaterThan(1);
			expect(shims.hasSpeeds()).toBe(true);
		});

		it('muted() reads volumeState and muted(state) routes through mute()/unmute()', async () => {
			const { player, shims } = await makeShimmedPlayer();

			expect(shims.muted()).toBe(false);

			shims.muted(true);
			await tick();
			expect(player.volumeState()).toBe(VolumeState.MUTED);
			expect(shims.muted()).toBe(true);

			shims.muted(false);
			await tick();
			expect(player.volumeState()).toBe(VolumeState.UNMUTED);
			expect(shims.muted()).toBe(false);
		});

		it('gain() reads the applied element volume off the backend', async () => {
			const { shims, harness } = await makeShimmedPlayer();

			harness.element.volume = 0.66;
			expect(shims.gain()).toBe(0.66);
		});

		it('state() returns the current playState token', async () => {
			const { player, shims } = await makeShimmedPlayer();

			expect(shims.state()).toBe(player.playState());
			expect(typeof shims.state()).toBe('string');
		});

		it('isPlaying tracks the real play-state bridge from backend events', async () => {
			const { shims, harness } = await makeShimmedPlayer();

			expect(shims.isPlaying).toBe(false);

			harness.fire('play');
			expect(shims.isPlaying).toBe(true);

			harness.fire('pause');
			expect(shims.isPlaying).toBe(false);
		});

		it('currentTime() reads and currentTime(seconds) seeks', async () => {
			const { player, shims, harness } = await makeShimmedPlayer();

			expect(shims.currentTime()).toBe(0);

			shims.currentTime(30);
			await tick();
			expect(shims.currentTime()).toBe(30);
			expect(player.time()).toBe(30);
			expect(harness.backend.currentTime).toHaveBeenCalledWith(30);
		});
	});

	// ── Track shims ───────────────────────────────────────────────────────────

	describe('track shims', () => {
		it('currentTrack() returns {} when nothing is loaded', async () => {
			const { shims } = await makeShimmedPlayer();

			expect(shims.currentTrack()).toEqual({});
			expect(shims.playlistItem()).toEqual({});
		});

		it('currentTrack() and trackList() mirror item() and queue()', async () => {
			const { player, shims } = await makeShimmedPlayer();

			const items = [track('a'), track('b'), track('c')];
			player.queue(items);

			expect(shims.currentTrack()).toEqual(player.item());
			expect(shims.trackList()).toEqual(player.queue());
			expect(shims.trackList().map(entry => entry.id)).toEqual(['a', 'b', 'c']);
		});

		it('nextTrack() and previousTrack() move the queue cursor', async () => {
			const { player, shims } = await makeShimmedPlayer();

			player.queue([track('a'), track('b')]);
			expect(player.index()).toBe(0);

			await shims.nextTrack();
			expect(player.index()).toBe(1);

			await shims.previousTrack();
			expect(player.index()).toBe(0);
		});

		it('playTrack(target) navigates the cursor and autoplays', async () => {
			const { player, shims, harness } = await makeShimmedPlayer();

			player.queue([track('a'), track('b'), track('c')]);

			shims.playTrack('c');
			expect(player.item()?.id).toBe('c');

			await tick();
			const loadedUrls = (harness.backend.load as ReturnType<typeof vi.fn>).mock.calls.map(args => args[0]);
			expect(loadedUrls).toContain('blob:c');
			expect(harness.backend.play).toHaveBeenCalled();
		});
	});

	// ── Playlist shims ────────────────────────────────────────────────────────

	describe('playlist shims', () => {
		it('playlist() reads and playlist(items) replaces the queue', async () => {
			const { player, shims } = await makeShimmedPlayer();

			expect(shims.playlist()).toEqual([]);

			const items = [track('a'), track('b')];
			shims.playlist(items);
			expect(player.queue().map(entry => entry.id)).toEqual(['a', 'b']);
			expect(shims.playlist()).toEqual(player.queue());
		});

		it('setPlaylist(items) replaces the queue like queue(items)', async () => {
			const { player, shims } = await makeShimmedPlayer();

			shims.setPlaylist([track('x1'), track('x2'), track('x3')]);
			expect(player.queueLength()).toBe(3);
			expect(player.queue().map(entry => entry.id)).toEqual(['x1', 'x2', 'x3']);
		});

		it('playlistIndex(), isFirstPlaylistItem(), isLastPlaylistItem() track the cursor', async () => {
			const { player, shims } = await makeShimmedPlayer();

			player.queue([track('a'), track('b'), track('c')]);

			expect(shims.playlistIndex()).toBe(0);
			expect(shims.isFirstPlaylistItem()).toBe(true);
			expect(shims.isLastPlaylistItem()).toBe(false);

			player.item('c');
			expect(shims.playlistIndex()).toBe(2);
			expect(shims.isFirstPlaylistItem()).toBe(false);
			expect(shims.isLastPlaylistItem()).toBe(true);
		});

		it('hasPlaylists() derives from queue length', async () => {
			const { player, shims } = await makeShimmedPlayer();

			player.queue([track('solo')]);
			expect(shims.hasPlaylists()).toBe(false);

			player.queue([track('a'), track('b')]);
			expect(shims.hasPlaylists()).toBe(true);
		});

		it('v1-shaped item fields (cover, artist, album, string duration) round-trip unchanged', async () => {
			const { shims } = await makeShimmedPlayer();

			const legacyItem: MusicPlaylistItem = {
				id: 'legacy-1',
				name: 'Old Song',
				url: 'blob:legacy-1',
				cover: 'https://cdn/cover.jpg',
				artist: 'Artist X',
				album: 'Album Y',
				duration: '3:42',
				lyricsUrl: 'https://cdn/lyrics.lrc',
			};
			shims.setPlaylist([legacyItem]);

			expect(shims.playlist()[0]).toMatchObject({
				id: 'legacy-1',
				name: 'Old Song',
				cover: 'https://cdn/cover.jpg',
				artist: 'Artist X',
				album: 'Album Y',
				duration: '3:42',
				lyricsUrl: 'https://cdn/lyrics.lrc',
			});
			expect(shims.currentTrack()).toMatchObject({ id: 'legacy-1' });
		});

		it('load(items[]) replaces the queue; load(item) delegates to the original loader', async () => {
			const { player, shims, harness } = await makeShimmedPlayer();

			shims.load([track('a'), track('b')]);
			expect(player.queue().map(entry => entry.id)).toEqual(['a', 'b']);

			await shims.load(track('single'));
			const loadedUrls = (harness.backend.load as ReturnType<typeof vi.fn>).mock.calls.map(args => args[0]);
			expect(loadedUrls).toContain('blob:single');
		});
	});

	// ── Translation shims ─────────────────────────────────────────────────────

	describe('translation shims', () => {
		it('addTranslation(key, value) registers for the active language; localize() resolves it', async () => {
			const { player, shims } = await makeShimmedPlayer();

			shims.addTranslation('legacy.greeting', 'Hallo wereld');

			expect(player.t('legacy.greeting')).toBe('Hallo wereld');
			expect(shims.localize('legacy.greeting')).toBe('Hallo wereld');
		});

		it('addTranslations(entries[]) ingests the v1 entry-list form', async () => {
			const { player, shims } = await makeShimmedPlayer();

			shims.addTranslations([
				{ key: 'legacy.play', value: 'Afspelen' },
				{ key: 'legacy.pause', value: 'Pauzeren' },
			]);

			expect(player.t('legacy.play')).toBe('Afspelen');
			expect(player.t('legacy.pause')).toBe('Pauzeren');
		});

		it('addTranslations(bundle) still accepts the v2 bundle form', async () => {
			const { player, shims } = await makeShimmedPlayer();

			const lang = player.language();
			shims.addTranslations({ [lang]: { 'legacy.stop': 'Stoppen' } });

			expect(player.t('legacy.stop')).toBe('Stoppen');
		});

		it('setTitle(title) writes document.title directly', async () => {
			const { shims } = await makeShimmedPlayer();

			shims.setTitle('Now Playing — Test Track');
			expect(document.title).toBe('Now Playing — Test Track');
		});
	});

	// ── Lifecycle shims ───────────────────────────────────────────────────────

	describe('lifecycle shims', () => {
		it('registerPlugin() delegates to addPlugin() and returns the player for chaining', async () => {
			const { player, shims } = await makeShimmedPlayer();

			const returned = shims.registerPlugin(FixturePlugin);
			expect(returned).toBe(player);

			await tick();
			const instance = player.getPluginById<FixturePlugin>('v1-shim-fixture');
			expect(instance).toBeInstanceOf(FixturePlugin);
			expect(instance?.usedFlag).toBe(true);
		});

		it('usePlugin() is the same delegation under the other v1 name', async () => {
			const { player, shims } = await makeShimmedPlayer();

			shims.usePlugin(FixturePlugin);
			await tick();
			expect(player.getPluginById('v1-shim-fixture')).toBeInstanceOf(FixturePlugin);
		});

		it('plugin(id) reads back a registered plugin via getPluginById()', async () => {
			const { player, shims } = await makeShimmedPlayer();

			shims.registerPlugin(FixturePlugin);
			await tick();
			expect(shims.plugin('v1-shim-fixture')).toBe(player.getPluginById('v1-shim-fixture'));
			expect(shims.plugin('does-not-exist')).toBeUndefined();
		});
	});

	// ── Event bridges ─────────────────────────────────────────────────────────

	describe('legacy event bridges', () => {
		it('re-emits playbackRate as the v1 "speed" event through the real rate path', async () => {
			const { player, shims } = await makeShimmedPlayer();

			const speedEvents: unknown[] = [];
			player.on('speed' as any, (data: unknown) => { speedEvents.push(data); });

			shims.speed(1.5);
			await tick();

			expect(speedEvents).toEqual([{ rate: 1.5 }]);
		});

		it('re-emits queue as the v1 "playlist" event when the queue is replaced', async () => {
			const { player, shims } = await makeShimmedPlayer();

			const playlistEvents: unknown[] = [];
			player.on('playlist' as any, (data: unknown) => { playlistEvents.push(data); });

			shims.playlist([track('a'), track('b')]);

			expect(playlistEvents.length).toBe(1);
		});
	});

	// ── Deprecation logging ───────────────────────────────────────────────────

	describe('deprecation logging', () => {
		it('logs one warning naming the legacy method on every shim call', async () => {
			const { shims } = await makeShimmedPlayer();
			const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

			shims.speeds();

			const flattened = warnSpy.mock.calls.map(args => args.join(' '));
			expect(flattened.some(line => line.includes('player.speeds()'))).toBe(true);

			warnSpy.mockClear();
			shims.hasSpeeds();
			const secondPass = warnSpy.mock.calls.map(args => args.join(' '));
			expect(secondPass.some(line => line.includes('player.hasSpeeds()'))).toBe(true);
		});
	});

	// ── Registration guards ───────────────────────────────────────────────────

	describe('registration guards', () => {
		it('a second addPlugin(V1MusicCompatPlugin) throws core:plugin/duplicate-id', async () => {
			const { player } = await makeShimmedPlayer();

			let caught: unknown;
			try {
				player.addPlugin(V1MusicCompatPlugin);
			}
			catch (err) {
				caught = err;
			}
			expect(caught).toBeDefined();
			expect((caught as { code?: string }).code).toBe('core:plugin/duplicate-id');
		});

		it('removePluginById() detaches the event bridges', async () => {
			const { player } = await makeShimmedPlayer();

			player.removePluginById('v1-music-compat');

			const speedEvents: unknown[] = [];
			player.on('speed' as any, (data: unknown) => { speedEvents.push(data); });
			player.emit('playbackRate' as any, { rate: 2 } as any);

			expect(speedEvents).toEqual([]);
		});

		it('re-adding after removal reinstalls a working shim surface', async () => {
			const { player, shims } = await makeShimmedPlayer();

			player.removePluginById('v1-music-compat');
			player.addPlugin(V1MusicCompatPlugin);
			await tick();

			player.queue([track('a'), track('b')]);
			expect(shims.hasPlaylists()).toBe(true);
			expect(shims.trackList().length).toBe(2);

			const speedEvents: unknown[] = [];
			player.on('speed' as any, (data: unknown) => { speedEvents.push(data); });
			shims.speed(1.25);
			await tick();
			expect(speedEvents).toEqual([{ rate: 1.25 }]);
		});

		it('after dispose(), a fresh player on the same container carries no legacy surface', async () => {
			const { player } = await makeShimmedPlayer();
			const containerId = player.id;

			await player.dispose();

			const freshPlayer = new NMMusicPlayer(containerId).setup({});
			await freshPlayer.ready();

			const freshShims = freshPlayer as unknown as Partial<LegacySurface>;
			expect(freshShims.seek).toBeUndefined();
			expect('isPlaying' in freshPlayer).toBe(false);
		});
	});
});
