// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type {
	ActionOptions,
	LoadOptions,
	PluginCtorWithId,
	Translations,
} from '@nomercy-entertainment/nomercy-player-core';
import type { NMMusicPlayer } from '../index';
import type { MusicPlaylistItem } from '../types';
import { Plugin } from '@nomercy-entertainment/nomercy-player-core';
import { VolumeState } from '../types';

interface V1TranslationEntry {
	key: string;
	value: string;
}

function isTranslationEntryList(value: Translations | ReadonlyArray<V1TranslationEntry>): value is ReadonlyArray<V1TranslationEntry> {
	return Array.isArray(value);
}

declare module '@nomercy-entertainment/nomercy-music-player' {
	interface NMMusicPlayer<T extends MusicPlaylistItem = MusicPlaylistItem> {
		/** @deprecated v1 shim — use `playState()`. */
		readonly isPlaying: boolean;

		/** @deprecated v1 shim — use `time(seconds)`. */
		seek(seconds: number, opts?: ActionOptions): number;

		/** @deprecated v1 shim — use `playbackRate()`. */
		speed(): number;
		/** @deprecated v1 shim — use `playbackRate(rate)`. */
		speed(rate: number): void;
		/** @deprecated v1 shim — use `playbackRates()`. */
		speeds(): number[];
		/** @deprecated v1 shim — derive from `playbackRates().length > 1`. */
		hasSpeeds(): boolean;

		/** @deprecated v1 shim — use `volumeState() === VolumeState.MUTED`. */
		muted(): boolean;
		/** @deprecated v1 shim — use `mute()` / `unmute()`. */
		muted(state: boolean): void;
		/** @deprecated v1 shim — no v2 equivalent. Reads the backend's applied element volume. */
		gain(): number;

		/** @deprecated v1 shim — use `playState()`. */
		state(): string;

		/** @deprecated v1 shim — use `time()`. */
		currentTime(): number;
		/** @deprecated v1 shim — use `time(seconds)`. */
		currentTime(seconds: number, opts?: ActionOptions): void;

		/** @deprecated v1 shim — use `item()`. */
		currentTrack(): T | Record<string, never>;
		/** @deprecated v1 shim — use `queue()`. */
		trackList(): ReadonlyArray<T>;
		/** @deprecated v1 shim — use `next()`. */
		nextTrack(opts?: LoadOptions): Promise<void>;
		/** @deprecated v1 shim — use `previous()`. */
		previousTrack(opts?: LoadOptions): Promise<void>;
		/** @deprecated v1 shim — use `item(target, { autoplay: true })`. */
		playTrack(target: T | string | number, opts?: LoadOptions): void;

		/** @deprecated v1 shim — use `queue()`. */
		playlist(): ReadonlyArray<T>;
		/** @deprecated v1 shim — use `queue(items, opts)`. */
		playlist(items: T[], opts?: ActionOptions): void;
		/** @deprecated v1 shim — use `item()`. */
		playlistItem(): T | Record<string, never>;
		/** @deprecated v1 shim — use `index()`. */
		playlistIndex(): number;
		/** @deprecated v1 shim — use `queue(items, opts)`. */
		setPlaylist(items: T[], opts?: ActionOptions): void;
		/** @deprecated v1 shim — derive from `index() === 0`. */
		isFirstPlaylistItem(): boolean;
		/** @deprecated v1 shim — derive from `index() === queueLength() - 1`. */
		isLastPlaylistItem(): boolean;
		/** @deprecated v1 shim — derive from `queueLength() > 1`. */
		hasPlaylists(): boolean;

		/** @deprecated v1 shim — use `t(key, vars)`. */
		localize(key: string, vars?: Record<string, string>): string;
		/** @deprecated v1 shim — use `translation(language(), key, value)`. */
		addTranslation(key: string, value: string): void;
		/** @deprecated v1 shim — no v2 equivalent. Writes `document.title` directly. */
		setTitle(title: string): void;

		/** @deprecated v1 shim — use `addPlugin(PluginClass, opts)`. */
		registerPlugin<P extends Plugin<any, any, any>>(PluginClass: PluginCtorWithId & (new () => P), opts?: P['opts']): NMMusicPlayer<T>;
		/** @deprecated v1 shim — use `addPlugin(PluginClass, opts)`. */
		usePlugin<P extends Plugin<any, any, any>>(PluginClass: PluginCtorWithId & (new () => P), opts?: P['opts']): NMMusicPlayer<T>;
		/** @deprecated v1 shim — use `getPluginById(id)`. */
		plugin<P extends object = object>(id: string): P | undefined;
	}
}

/**
 * Legacy API-surface shim for `nomercy-music-player` v1 consumers migrating
 * to v2. Attaches the old method names onto the player instance; every shim
 * delegates to the real v2 API and logs one deprecation line per call.
 *
 * There is no v1 e2e contract for the music player (unlike video), so this
 * surface is derived directly from the v1/JWPlayer-style audio API convention
 * mapped onto the real v2 `NMMusicPlayer` surface — verified against
 * `src/index.ts`, not guessed.
 *
 * Opt-in only — add via `player.addPlugin(V1MusicCompatPlugin)` before
 * `setup()`. Nothing here changes v2 behaviour for consumers that don't load
 * it. Delete this file (and its one export line in `src/index.ts`) once every
 * v1 consumer has migrated.
 */
export class V1MusicCompatPlugin extends Plugin<NMMusicPlayer> {
	static override readonly id: string = 'v1-music-compat';
	static override readonly version: string = '1.0.0';
	static override readonly description: string = 'Attaches the legacy v1 method surface onto the v2 music player. Every shim delegates to the current API and logs a deprecation warning.';

	private _warn(method: string): void {
		this.logger.warn(`@deprecated player.${method}() is a v1 compatibility shim — migrate to the v2 API before it is removed.`);
	}

	override use(): void {
		this._installTransportShims();
		this._installTrackShims();
		this._installPlaylistShims();
		this._installTranslationShims();
		this._installLifecycleShims();
		this._installEventBridges();
	}

	private _installTransportShims(): void {
		const player = this.player;
		const warn = this._warn.bind(this);

		player.seek = (seconds: number, opts?: ActionOptions): number => {
			warn('seek');
			const duration = player.duration();
			const clamped = Number.isFinite(duration) && duration > 0
				? Math.max(0, Math.min(duration, seconds))
				: seconds;
			void player.time(clamped, opts);
			return clamped;
		};

		function speed(): number;
		function speed(rate: number): void;
		function speed(rate?: number): number | void {
			warn('speed');
			if (rate === undefined)
				return player.playbackRate();
			player.playbackRate(rate);
		}
		player.speed = speed;

		player.speeds = (): number[] => {
			warn('speeds');
			return player.playbackRates();
		};

		player.hasSpeeds = (): boolean => {
			warn('hasSpeeds');
			return player.playbackRates().length > 1;
		};

		function muted(): boolean;
		function muted(state: boolean): void;
		function muted(state?: boolean): boolean | void {
			warn('muted');
			if (state === undefined)
				return player.volumeState() === VolumeState.MUTED;
			if (state)
				player.mute();
			else player.unmute();
		}
		player.muted = muted;

		player.gain = (): number => {
			warn('gain');
			return player.backend().mediaElement().volume;
		};

		function currentTime(): number;
		function currentTime(seconds: number, opts?: ActionOptions): void;
		function currentTime(seconds?: number, opts?: ActionOptions): number | void {
			warn('currentTime');
			if (seconds === undefined)
				return player.time();
			void player.time(seconds, opts);
		}
		player.currentTime = currentTime;

		player.state = (): string => {
			warn('state');
			return player.playState();
		};

		Object.defineProperty(player, 'isPlaying', {
			configurable: true,
			enumerable: true,
			get: (): boolean => player.playState() === 'playing',
		});
	}

	private _installTrackShims(): void {
		const player = this.player;
		const warn = this._warn.bind(this);

		player.currentTrack = (): MusicPlaylistItem | Record<string, never> => {
			warn('currentTrack');
			return player.item() ?? {};
		};

		player.trackList = (): ReadonlyArray<MusicPlaylistItem> => {
			warn('trackList');
			return player.queue();
		};

		player.nextTrack = (opts?: LoadOptions): Promise<void> => {
			warn('nextTrack');
			return player.next(opts);
		};

		player.previousTrack = (opts?: LoadOptions): Promise<void> => {
			warn('previousTrack');
			return player.previous(opts);
		};

		player.playTrack = (target: MusicPlaylistItem | string | number, opts?: LoadOptions): void => {
			warn('playTrack');
			player.item(target, {
				...opts,
				autoplay: true,
			});
		};
	}

	private _installPlaylistShims(): void {
		const player = this.player;
		const warn = this._warn.bind(this);
		const originalLoad = player.load.bind(player);

		function playlist(): ReadonlyArray<MusicPlaylistItem>;
		function playlist(items: MusicPlaylistItem[], opts?: ActionOptions): void;
		function playlist(items?: MusicPlaylistItem[], opts?: ActionOptions): ReadonlyArray<MusicPlaylistItem> | void {
			warn('playlist');
			if (items === undefined)
				return player.queue();
			player.queue(items, opts);
		}
		player.playlist = playlist;

		player.playlistItem = (): MusicPlaylistItem | Record<string, never> => {
			warn('playlistItem');
			return player.item() ?? {};
		};

		player.playlistIndex = (): number => {
			warn('playlistIndex');
			return player.index();
		};

		function load(items: MusicPlaylistItem[]): void;
		function load(item: MusicPlaylistItem, opts?: LoadOptions): Promise<void>;
		function load(itemsOrItem: MusicPlaylistItem[] | MusicPlaylistItem, opts?: LoadOptions): void | Promise<void> {
			warn('load');
			if (Array.isArray(itemsOrItem)) {
				player.queue(itemsOrItem);
				return;
			}
			return originalLoad(itemsOrItem, opts);
		}
		player.load = load;

		player.setPlaylist = (items: MusicPlaylistItem[], opts?: ActionOptions): void => {
			warn('setPlaylist');
			player.queue(items, opts);
		};

		player.isFirstPlaylistItem = (): boolean => {
			warn('isFirstPlaylistItem');
			return player.index() === 0;
		};

		player.isLastPlaylistItem = (): boolean => {
			warn('isLastPlaylistItem');
			return player.index() === player.queueLength() - 1;
		};

		player.hasPlaylists = (): boolean => {
			warn('hasPlaylists');
			return player.queueLength() > 1;
		};
	}

	private _installTranslationShims(): void {
		const player = this.player;
		const warn = this._warn.bind(this);
		const originalAddTranslations = player.addTranslations.bind(player);

		player.localize = (key: string, vars?: Record<string, string>): string => {
			warn('localize');
			return player.t(key, vars);
		};

		player.addTranslation = (key: string, value: string): void => {
			warn('addTranslation');
			player.translation(player.language(), key, value);
		};

		function addTranslations(bundle: Translations): void;
		function addTranslations(entries: ReadonlyArray<V1TranslationEntry>): void;
		function addTranslations(bundleOrEntries: Translations | ReadonlyArray<V1TranslationEntry>): void {
			warn('addTranslations');
			if (isTranslationEntryList(bundleOrEntries)) {
				const lang = player.language();
				for (const entry of bundleOrEntries) {
					player.translation(lang, entry.key, entry.value);
				}
				return;
			}
			originalAddTranslations(bundleOrEntries);
		}
		player.addTranslations = addTranslations;

		player.setTitle = (title: string): void => {
			warn('setTitle');
			if (typeof document !== 'undefined') {
				document.title = title;
			}
		};
	}

	private _installLifecycleShims(): void {
		const player = this.player;
		const warn = this._warn.bind(this);

		player.registerPlugin = <P extends Plugin<any, any, any>>(PluginClass: PluginCtorWithId & (new () => P), opts?: P['opts']): NMMusicPlayer<MusicPlaylistItem> => {
			warn('registerPlugin');
			return player.addPlugin(PluginClass, opts);
		};

		player.usePlugin = <P extends Plugin<any, any, any>>(PluginClass: PluginCtorWithId & (new () => P), opts?: P['opts']): NMMusicPlayer<MusicPlaylistItem> => {
			warn('usePlugin');
			return player.addPlugin(PluginClass, opts);
		};

		player.plugin = <P extends object = object>(id: string): P | undefined => {
			warn('plugin');
			return player.getPluginById<P>(id);
		};
	}

	private _installEventBridges(): void {
		const player = this.player;

		this.on('playbackRate', (data) => { player.emit('speed', data); });
		this.on('queue', (items) => { player.emit('playlist', items); });
	}
}
