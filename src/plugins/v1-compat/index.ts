/**
 * @module v1-compat — Music Player v1→v2 migration shim
 *
 * TEMPORARY. This plugin will be removed in the first stable 2.x release after
 * the migration window closes. Keep the entire shim tree isolated under
 * `src/plugins/v1-compat/` so deletion is a single folder removal.
 *
 * When registered, `V1MusicCompatPlugin`:
 *  - Attaches every missing/renamed v1 method onto the player instance, each
 *    delegating to its v2 equivalent.
 *  - Bridges renamed v1 event names: a listener registered under a v1 name
 *    receives the corresponding v2 event with its payload reshaped to the v1 shape.
 *  - Logs a `console.warn` deprecation notice ONCE per distinct v1 API used
 *    (never once-per-call).
 *  - Provides safe no-op / sensible-default stubs for v1 surface that has no v2
 *    core equivalent (EQ state, audiomotion-analyzer accessors, siteTitle). These
 *    stubs never throw — external v1 code keeps running with deprecation warnings.
 *
 * Registration:
 * ```ts
 * import { V1MusicCompatPlugin } from '@nomercy-entertainment/nomercy-music-player/plugins/v1-compat';
 * player.addPlugin(V1MusicCompatPlugin);
 * ```
 */

import type { NMMusicPlayer } from '../../index';
import type {
	EQBand,
	EQSliderValues,
	EqualizerPreset,
	MusicPlaylistItem,
} from '../../types';
import { PlayState, VolumeState } from '../../types';
import { Plugin } from '@nomercy-entertainment/nomercy-player-core';

// ---------------------------------------------------------------------------
// Deprecation accounting
// ---------------------------------------------------------------------------

/** Set of v1 API names for which a deprecation warning has already been emitted. */
const _warnedSet = new Set<string>();

function _warnDeprecated(v1Name: string, v2Name: string): void {
	if (_warnedSet.has(v1Name)) {
		return;
	}
	_warnedSet.add(v1Name);
	console.warn(
		`[nomercy-music-player] DEPRECATED "${v1Name}" — use "${v2Name}" instead. `
		+ `This shim is provided by V1MusicCompatPlugin and will be removed in the first stable 2.x release.`,
	);
}

function _warnRemoved(v1Name: string, reason: string): void {
	if (_warnedSet.has(v1Name)) {
		return;
	}
	_warnedSet.add(v1Name);
	console.warn(
		`[nomercy-music-player] "${v1Name}" was removed in v2 — ${reason}`,
	);
}

function _warnPayloadBridged(eventName: string): void {
	const key = `payload:${eventName}`;
	if (_warnedSet.has(key)) {
		return;
	}
	_warnedSet.add(key);
	console.warn(
		`[nomercy-music-player] on('${eventName}') is delivered with its v1 payload shape by V1MusicCompatPlugin. `
		+ `The v2 payload differs — update the listener before the plugin is removed in the first stable 2.x release.`,
	);
}

// ---------------------------------------------------------------------------
// v1 event → v2 event mapping
// ---------------------------------------------------------------------------

/**
 * Maps a v1 event name to a v2 event name plus an optional payload transformer.
 */
interface V1EventMapping {
	v2Event: string;
	reshape?: (v2Data: unknown) => unknown;
}

/**
 * v1 TimeState payload shape (only the fields v1 consumers actually read).
 */
interface V1TimeState {
	buffered: number;
	duration: number;
	percentage: number;
	position: number;
	remaining: number;
}

function _toV1TimeState(v2Data: unknown): V1TimeState {
	const v2 = v2Data as { time?: number; percentage?: number; position?: number } | undefined;
	const position = v2?.time ?? v2?.position ?? 0;
	const duration = _currentDuration;
	const safeD = Number.isFinite(duration) && duration > 0 ? duration : 0;
	const percentage = v2?.percentage ?? (safeD > 0 ? (position / safeD) * 100 : 0);
	const remaining = safeD > 0 ? safeD - position : 0;
	return {
		buffered: 0,
		duration: safeD,
		percentage,
		position,
		remaining,
	};
}

/** Module-level mutable duration tracker — updated by each plugin instance's duration listener. */
let _currentDuration = 0;

/**
 * Build the v1→v2 event bridge table. Constructed lazily per plugin instance.
 */
function _buildEventMap(): Record<string, V1EventMapping> {
	return {
		// v1 'play' fired with HTMLAudioElement; v2 'play' fires with undefined.
		play: {
			v2Event: 'play',
			reshape: _data => undefined,
		},
		// v1 'pause' fired with HTMLAudioElement; v2 'pause' fires with undefined.
		pause: {
			v2Event: 'pause',
			reshape: _data => undefined,
		},
		// v1 'time' fired with TimeState; v2 fires { time: number }.
		time: {
			v2Event: 'time',
			reshape: data => _toV1TimeState(data),
		},
		// v1 'song' fired with BasePlaylistItem | null; v2 uses 'item' with { item, index }.
		song: {
			v2Event: 'item',
			reshape: (data) => {
				const v2 = data as { item?: MusicPlaylistItem; index?: number } | undefined;
				return v2?.item ?? null;
			},
		},
		// v1 'queue' fired with S[]; v2 doesn't fire a queue event on set.
		// Cannot auto-bridge — consumer must read queue() directly.
		queue: { v2Event: 'ready' }, // no-op bridge
		// v1 'backlog' fired with S[]; v2 equivalent not defined.
		backlog: { v2Event: 'ready' }, // no-op bridge
		// v1 'repeat' fired with RepeatState string; v2 fires { state: RepeatState }.
		repeat: {
			v2Event: 'repeat',
			reshape: (data) => {
				const v2 = data as { state?: string } | undefined;
				return v2?.state ?? 'off';
			},
		},
		// v1 'shuffle' fired with boolean; v2 fires { state: ShuffleState }.
		shuffle: {
			v2Event: 'shuffle',
			reshape: (data) => {
				const v2 = data as { state?: string } | undefined;
				return v2?.state === 'on';
			},
		},
		// v1 'mute' fired with boolean; v2 fires { muted: boolean }.
		mute: {
			v2Event: 'mute',
			reshape: (data) => {
				const v2 = data as { muted?: boolean } | undefined;
				return v2?.muted ?? false;
			},
		},
		// v1 'volume' fired with number (0–100); v2 fires { level: number }.
		volume: {
			v2Event: 'volume',
			reshape: (data) => {
				const v2 = data as { level?: number } | undefined;
				return v2?.level ?? 100;
			},
		},
		// Lifecycle passthroughs
		ready: { v2Event: 'ready' },
		error: { v2Event: 'error' },
		ended: { v2Event: 'ended' },
		firstFrame: { v2Event: 'firstFrame' },
		// v1 'seeked' fired with TimeState; v2 doesn't have a seeked event.
		// Bridge from 'time' as best approximation.
		seeked: {
			v2Event: 'time',
			reshape: data => _toV1TimeState(data),
		},
		// v1 'crossfadeStart' / 'crossfadeComplete' map directly to v2.
		crossfadeStart: {
			v2Event: 'crossfadeStart',
			reshape: (data) => {
				const v2 = data as { from?: unknown; to?: unknown; duration?: number } | undefined;
				return {
					from: v2?.from,
					to: v2?.to,
				};
			},
		},
		crossfadeComplete: {
			v2Event: 'crossfadeComplete',
			reshape: (data) => {
				const v2 = data as { track?: unknown } | undefined;
				return v2?.track;
			},
		},
		// v1 'stop' fired with no payload; v2 fires 'stop' with undefined.
		stop: { v2Event: 'stop' },
		// v1 'fatalError' passthrough.
		fatalError: { v2Event: 'error' },
		// v1 'setCurrentAudio' was an internal event; bridge to ready as best approximation.
		setCurrentAudio: { v2Event: 'ready' },
	};
}

// ---------------------------------------------------------------------------
// Plugin events
// ---------------------------------------------------------------------------

/** Events emitted by {@link V1MusicCompatPlugin} (none — pure shim). */
export type V1MusicCompatEvents = Record<string, never>;

/**
 * Options accepted by {@link V1MusicCompatPlugin}.
 *
 * Pass as the second argument to `player.addPlugin(V1MusicCompatPlugin, opts)`.
 * All fields are optional — the plugin is fully functional without them.
 */
export interface V1MusicCompatOptions {
	/**
	 * v1-era `config.actions` callbacks. When provided, each callback is wired
	 * to the corresponding v2 player event so that v1 consumer code that passed
	 * inline handlers via the config object continues to fire.
	 *
	 * @deprecated Wire event listeners via `player.on(...)` in v2 instead.
	 */
	actions?: {
		play?: () => void;
		pause?: () => void;
		stop?: () => void;
		previous?: () => void;
		next?: () => void;
		seek?: (position: number) => void;
	};
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

/**
 * v1→v2 migration shim for the music player.
 *
 * @deprecated This plugin will be removed in the first stable 2.x release after
 * the migration window. Register it only during migration; remove once the
 * consumer is updated to the v2 API.
 */
export class V1MusicCompatPlugin extends Plugin<
	NMMusicPlayer<MusicPlaylistItem>,
	V1MusicCompatOptions,
	V1MusicCompatEvents
> {
	static override readonly id: string = 'v1-compat';
	static override readonly version: string = '2.0.0';
	static override readonly description: string = 'v1→v2 migration shim — TEMPORARY, removed after migration window';

	/** Methods patched directly onto the player instance (by name). Removed on dispose(). */
	private _patchedMethods: string[] = [];

	/**
	 * v1 on() wrappers we registered so we can clean them up.
	 * Shape: { v2Event, listener } — on dispose we call player.off(v2Event, listener).
	 */
	private _eventBridges: Array<{ v2Event: string; listener: (data: unknown) => void }> = [];

	/** Saved reference to the original player.on() so we can restore it on dispose(). */
	private _originalOn: typeof this.player.on | undefined;

	override use(): void {
		this._installOnInterceptor();
		this._attachMethodShims();

		// Track current duration so the time event reshaper can include remaining/percentage.
		this.player.on('duration', (data: { duration: number }) => {
			_currentDuration = data.duration;
		});

		// Wire v1 config.actions callbacks — these fire in addition to normal v2 event
		// listeners so both the v1 actions object AND v2 on() listeners work simultaneously.
		this._wireActions();
	}

	/**
	 * Wire any v1 `actions` callbacks from the plugin options.
	 * Each callback is registered as a plain v2 event listener so the plugin's
	 * own `dispose()` removes them automatically via `_eventBridges`.
	 */
	private _wireActions(): void {
		const actions = this.opts?.actions;
		if (!actions) {
			return;
		}

		const { play: onPlay, pause: onPause, stop: onStop, previous: onPrevious, next: onNext, seek: onSeek } = actions;

		if (onPlay) {
			const listener = (): void => onPlay();
			this.player.on('play' as never, listener as never);
			this._eventBridges.push({ v2Event: 'play', listener: listener as (d: unknown) => void });
		}

		if (onPause) {
			const listener = (): void => onPause();
			this.player.on('pause' as never, listener as never);
			this._eventBridges.push({ v2Event: 'pause', listener: listener as (d: unknown) => void });
		}

		if (onStop) {
			const listener = (): void => onStop();
			this.player.on('stop' as never, listener as never);
			this._eventBridges.push({ v2Event: 'stop', listener: listener as (d: unknown) => void });
		}

		if (onPrevious) {
			const listener = (): void => onPrevious();
			this.player.on('previous' as never, listener as never);
			this._eventBridges.push({ v2Event: 'previous', listener: listener as (d: unknown) => void });
		}

		if (onNext) {
			const listener = (): void => onNext();
			this.player.on('next' as never, listener as never);
			this._eventBridges.push({ v2Event: 'next', listener: listener as (d: unknown) => void });
		}

		if (onSeek) {
			const listener = (state: unknown): void => {
				const position = (state as { position?: number } | undefined)?.position ?? 0;
				onSeek(position);
			};
			this.player.on('time' as never, listener as never);
			this._eventBridges.push({ v2Event: 'time', listener: listener as (d: unknown) => void });
		}
	}

	override dispose(): void {
		if (this._originalOn) {
			(this.player as unknown as Record<string, unknown>)['on'] = this._originalOn;
			this._originalOn = undefined;
		}

		for (const bridge of this._eventBridges) {
			this.player.off(
				bridge.v2Event as keyof typeof this.player.__eventMap__,
				bridge.listener as Parameters<typeof this.player.off>[1],
			);
		}
		this._eventBridges = [];

		for (const name of this._patchedMethods) {
			try {
				delete (this.player as unknown as Record<string, unknown>)[name];
			}
			catch {
				// Non-configurable — ignore.
			}
		}
		this._patchedMethods = [];
	}

	// ── on() interceptor ─────────────────────────────────────────────────────

	/**
	 * Replaces `player.on()` with a proxy that maps v1 event names to v2 events
	 * with payload reshaping. Unknown event names fall through to the original.
	 */
	private _installOnInterceptor(): void {
		const player = this.player;
		const originalOn = player.on.bind(player) as typeof player.on;
		this._originalOn = player.on;

		const eventMap = _buildEventMap();

		(player as unknown as Record<string, unknown>)['on'] = (
			event: string,
			callback: (data: unknown) => void,
		): void => {
			const mapping = eventMap[event];
			// Same name, no reshape: nothing to bridge — plain subscription.
			if (mapping && event === mapping.v2Event && !mapping.reshape) {
				(originalOn as (event: string, cb: (d: unknown) => void) => void)(event, callback);
				return;
			}
			if (mapping) {
				if (event === mapping.v2Event) {
					_warnPayloadBridged(event);
				}
				else {
					_warnDeprecated(`on('${event}')`, `on('${mapping.v2Event}')`);
				}
				const listener = (v2Data: unknown): void => {
					const payload = mapping.reshape ? mapping.reshape(v2Data) : v2Data;
					callback(payload);
				};
				(originalOn as (event: string, cb: (d: unknown) => void) => void)(
					mapping.v2Event,
					listener,
				);
				this._eventBridges.push({
					v2Event: mapping.v2Event,
					listener,
				});
				return;
			}
			(originalOn as (event: string, cb: (d: unknown) => void) => void)(event, callback);
		};
	}

	// ── Method shims ─────────────────────────────────────────────────────────

	private _patchMethod(name: string, fn: (...args: unknown[]) => unknown): void {
		const target = this.player as unknown as Record<string, unknown>;
		if (typeof target[name] !== 'function') {
			target[name] = fn;
			this._patchedMethods.push(name);
		}
	}

	private _attachMethodShims(): void {
		const player = this.player;

		// ── Volume ────────────────────────────────────────────────────────

		/**
		 * @deprecated Use `player.volume(v)` instead.
		 */
		this._patchMethod('setVolume', (volumeValue: unknown) => {
			_warnDeprecated('setVolume(volume)', 'volume(v)');
			player.volume(Number(volumeValue));
		});

		/**
		 * @deprecated Use `player.volume()` instead.
		 */
		this._patchMethod('getVolume', () => {
			_warnDeprecated('getVolume()', 'volume()');
			return player.volume();
		});

		/**
		 * @deprecated Use `player.mute()` instead.
		 */
		this._patchMethod('mute', () => {
			_warnDeprecated('mute()', 'mute()');
			player.mute();
		});

		/**
		 * @deprecated Use `player.unmute()` instead.
		 */
		this._patchMethod('unmute', () => {
			_warnDeprecated('unmute()', 'unmute()');
			player.unmute();
		});

		// ── Time ──────────────────────────────────────────────────────────

		/**
		 * @deprecated Use `player.time(t)` instead.
		 * v1 seek(time) delegated to the audio element; v2 routes through the
		 * backend via time(t).
		 */
		this._patchMethod('seek', (timeValue: unknown) => {
			_warnDeprecated('seek(time)', 'time(t)');
			void player.time(Number(timeValue));
		});

		/**
		 * @deprecated Use `player.duration()` instead.
		 */
		this._patchMethod('getDuration', () => {
			_warnDeprecated('getDuration()', 'duration()');
			return player.duration();
		});

		/**
		 * @deprecated Use `player.time()` instead.
		 */
		this._patchMethod('getCurrentTime', () => {
			_warnDeprecated('getCurrentTime()', 'time()');
			return player.time();
		});

		/**
		 * @deprecated Use `player.buffered()` instead.
		 */
		this._patchMethod('getBuffer', () => {
			_warnDeprecated('getBuffer()', 'buffered()');
			return player.buffered();
		});

		/**
		 * @deprecated Use `player.timeData()` instead.
		 */
		this._patchMethod('getTimeData', () => {
			_warnDeprecated('getTimeData()', 'timeData()');
			return player.timeData();
		});

		// ── Queue / Playlist ──────────────────────────────────────────────

		/**
		 * @deprecated Use `player.queue()` instead.
		 */
		this._patchMethod('getQueue', () => {
			_warnDeprecated('getQueue()', 'queue()');
			return [...player.queue()];
		});

		/**
		 * @deprecated Use `player.queue(items)` instead.
		 */
		this._patchMethod('setQueue', (items: unknown) => {
			_warnDeprecated('setQueue(items)', 'queue(items)');
			player.queue(items as MusicPlaylistItem[]);
		});

		/**
		 * @deprecated Use `player.queueAppend(item)` instead.
		 */
		this._patchMethod('addToQueue', (item: unknown) => {
			_warnDeprecated('addToQueue(item)', 'queueAppend(item)');
			player.queueAppend(item as MusicPlaylistItem);
		});

		/**
		 * @deprecated Use `player.queueAppend(item)` instead.
		 */
		this._patchMethod('pushToQueue', (items: unknown) => {
			_warnDeprecated('pushToQueue(item|items)', 'queueAppend(item|items)');
			player.queueAppend(items as MusicPlaylistItem | MusicPlaylistItem[]);
		});

		/**
		 * @deprecated Use `player.queueRemove(id)` instead.
		 */
		this._patchMethod('removeFromQueue', (item: unknown) => {
			_warnDeprecated('removeFromQueue(item)', 'queueRemove(id)');
			const id = (item as { id?: string | number } | undefined)?.id;
			if (id !== undefined) {
				player.queueRemove(id);
			}
		});

		/**
		 * @deprecated Use `player.queuePrepend(item)` instead.
		 */
		this._patchMethod('addToQueueNext', (item: unknown) => {
			_warnDeprecated('addToQueueNext(item)', 'queuePrepend(item)');
			player.queuePrepend(item as MusicPlaylistItem);
		});

		// ── Backlog ───────────────────────────────────────────────────────

		/**
		 * @deprecated Use `player.backlog()` instead.
		 */
		this._patchMethod('getBackLog', () => {
			_warnDeprecated('getBackLog()', 'backlog()');
			return [...player.backlog()];
		});

		/**
		 * @deprecated Use `player.backlog(items)` instead.
		 */
		this._patchMethod('setBackLog', (items: unknown) => {
			_warnDeprecated('setBackLog(items)', 'backlog(items)');
			player.backlog(items as MusicPlaylistItem[]);
		});

		/**
		 * @deprecated Use `player.backlogAppend(item)` instead.
		 */
		this._patchMethod('addToBackLog', (item: unknown) => {
			_warnDeprecated('addToBackLog(item)', 'backlogAppend(item)');
			if (item !== null && item !== undefined) {
				player.backlogAppend(item as MusicPlaylistItem);
			}
		});

		/**
		 * @deprecated Use `player.backlogAppend(items)` instead.
		 */
		this._patchMethod('pushToBackLog', (items: unknown) => {
			_warnDeprecated('pushToBackLog(item|items)', 'backlogAppend(item|items)');
			player.backlogAppend(items as MusicPlaylistItem | MusicPlaylistItem[]);
		});

		/**
		 * @deprecated Use `player.backlogRemove(id)` instead.
		 */
		this._patchMethod('removeFromBackLog', (item: unknown) => {
			_warnDeprecated('removeFromBackLog(item)', 'backlogRemove(id)');
			const id = (item as { id?: string | number } | undefined)?.id;
			if (id !== undefined) {
				player.backlogRemove(id);
			}
		});

		// ── Current song ──────────────────────────────────────────────────

		/**
		 * @deprecated Use `player.item(track)` to set the current track.
		 * In v2 `item(track)` both sets the cursor AND triggers load+play.
		 */
		this._patchMethod('setCurrentSong', (songItem: unknown) => {
			_warnDeprecated('setCurrentSong(track)', 'item(track)');
			if (songItem === null || songItem === undefined) {
				return;
			}
			player.item(songItem as MusicPlaylistItem);
		});

		/**
		 * @deprecated Use `player.item()` instead.
		 * Installed as a property getter (not a method) so v1 code accessing
		 * `player.currentSong` without parentheses continues to work.
		 */
		const currentSongTarget = this.player as unknown as Record<string, unknown>;
		if (!('currentSong' in currentSongTarget)) {
			Object.defineProperty(currentSongTarget, 'currentSong', {
				get: (): MusicPlaylistItem | undefined => {
					_warnDeprecated('currentSong', 'item()');
					return player.item();
				},
				configurable: true,
				enumerable: false,
			});
			this._patchedMethods.push('currentSong');
		}

		/**
		 * @deprecated Use `player.queue(tracks)` + `player.item(track)` + `player.play()` in v2.
		 * v1 `playTrack(item, queue?)` loaded the queue, seeked to the item, and started
		 * playback immediately. This shim replicates that three-step sequence.
		 */
		this._patchMethod('playTrack', (trackItem: unknown, tracksArray?: unknown) => {
			_warnDeprecated('playTrack(track, tracks?)', 'queue(tracks) + item(track) + play()');
			if (tracksArray !== undefined) {
				player.queue(tracksArray as MusicPlaylistItem[]);
			}
			if (trackItem !== null && trackItem !== undefined) {
				player.item(trackItem as MusicPlaylistItem);
			}
			void player.play();
		});

		// ── Repeat / Shuffle ──────────────────────────────────────────────

		/**
		 * @deprecated Use `player.repeatState(state)` instead.
		 * v1 `repeat(value)` was a setter only; v2 `repeatState(state)` is a
		 * getter/setter overload.
		 */
		this._patchMethod('repeat', (repeatValue: unknown) => {
			_warnDeprecated('repeat(value)', 'repeatState(state)');
			player.repeatState(repeatValue as Parameters<typeof player.repeatState>[0]);
		});

		/**
		 * @deprecated Use `player.shuffleState(state)` instead.
		 */
		this._patchMethod('shuffle', (shuffleValue: unknown) => {
			_warnDeprecated('shuffle(value)', 'shuffleState(state)');
			if (typeof shuffleValue === 'boolean') {
				player.shuffleState(shuffleValue);
			}
			else {
				player.shuffleState(shuffleValue as Parameters<typeof player.shuffleState>[0]);
			}
		});

		// ── Crossfade ─────────────────────────────────────────────────────

		/**
		 * @deprecated Use `player.crossfadeTo(item, opts?)` instead.
		 * v1 `prepareCrossfade(item?)` pre-loaded into a secondary buffer;
		 * v2 exposes this as a single `crossfadeTo()` call that handles both
		 * preload and crossfade transition.
		 */
		this._patchMethod('prepareCrossfade', (item?: unknown) => {
			_warnDeprecated('prepareCrossfade(item?)', 'crossfadeTo(item)');
			if (item === undefined) {
				const nextItem = player.peekNext();
				if (nextItem) {
					void player.crossfadeTo(nextItem);
				}
			}
			else {
				void player.crossfadeTo(item as MusicPlaylistItem);
			}
		});

		// ── Auto-play control ─────────────────────────────────────────────

		/**
		 * @deprecated Use `player.options?.autoAdvance` config field instead.
		 * v1 `setAutoPlayback(value)` was a runtime toggle; v2 sets this at
		 * setup time via config. Runtime mutation is not supported.
		 */
		this._patchMethod('setAutoPlayback', (autoValue: unknown) => {
			_warnRemoved(
				'setAutoPlayback(value)',
				'set `autoAdvance` in setup() config; runtime toggle not supported in v2',
			);
			// Best-effort: patch options at runtime (not guaranteed to take effect).
			const opts = player.options as Record<string, unknown> | undefined;
			if (opts) {
				opts['autoAdvance'] = Boolean(autoValue);
			}
		});

		// ── Access token ──────────────────────────────────────────────────

		/**
		 * @deprecated Use `player.auth({ bearerToken: token })` instead.
		 */
		this._patchMethod('setAccessToken', (tokenValue: unknown) => {
			_warnDeprecated('setAccessToken(token)', 'auth({ bearerToken: token })');
			if (typeof tokenValue === 'string' || typeof tokenValue === 'function') {
				const resolvedToken = typeof tokenValue === 'function'
					? (tokenValue as () => string)()
					: tokenValue;
				player.auth({ bearerToken: resolvedToken });
			}
		});

		// ── Base URL ──────────────────────────────────────────────────────

		/**
		 * @deprecated Use `player.baseUrl(url)` instead.
		 */
		this._patchMethod('setBaseUrl', (urlValue: unknown) => {
			_warnDeprecated('setBaseUrl(url)', 'baseUrl(url)');
			player.baseUrl(String(urlValue));
		});

		// ── Misc (removed) ────────────────────────────────────────────────

		/**
		 * @deprecated Removed in v2, no replacement — EQ state is managed by
		 * EqualizerPlugin. Use `player.getPlugin(EqualizerPlugin)` instead.
		 */
		this._patchMethod('loadEqualizerSettings', () => {
			_warnRemoved('loadEqualizerSettings()', 'use EqualizerPlugin.load() instead');
		});

		/**
		 * @deprecated Removed in v2, no replacement — EQ is managed by EqualizerPlugin.
		 */
		this._patchMethod('saveEqualizerSettings', () => {
			_warnRemoved('saveEqualizerSettings()', 'use EqualizerPlugin.save() instead');
		});

		/**
		 * @deprecated Removed in v2, no replacement — EQ pre-gain is managed by
		 * EqualizerPlugin.
		 */
		this._patchMethod('setPreGain', (gainValue: unknown) => {
			_warnRemoved('setPreGain(gain)', 'use EqualizerPlugin for pre-gain control');
			void gainValue;
		});

		/**
		 * @deprecated Removed in v2, no replacement — stereo panning is managed by
		 * MixerPlugin.
		 */
		this._patchMethod('setPanner', (panValue: unknown) => {
			_warnRemoved('setPanner(pan)', 'use MixerPlugin for stereo panning');
			void panValue;
		});

		/**
		 * @deprecated Removed in v2, no replacement — EQ filters are managed by
		 * EqualizerPlugin.
		 */
		this._patchMethod('setFilter', (filterValue: unknown) => {
			_warnRemoved('setFilter(filter)', 'use EqualizerPlugin.setBand() instead');
			void filterValue;
		});

		/**
		 * @deprecated Removed in v2, no replacement — `isPlatform` is a browser API
		 * concern. Use `navigator.userAgent` directly or the kit's `device()` method.
		 */
		this._patchMethod('isPlatform', (platformValue: unknown) => {
			_warnRemoved('isPlatform(platform)', 'use player.device() or navigator.userAgent directly');
			const ua = typeof navigator !== 'undefined' ? navigator.userAgent.toLowerCase() : '';
			if (platformValue === 'android') {
				return /android/.test(ua);
			}
			if (platformValue === 'ios') {
				return /iphone|ipad|ipod/.test(ua);
			}
			return false;
		});

		// ── getCurrentSong ────────────────────────────────────────────────

		/**
		 * @deprecated Use `player.item()` instead.
		 * v1 exposed `getCurrentSong()` as a method alias for the `currentSong`
		 * property. v2 uses the bare-noun `item()` getter.
		 */
		this._patchMethod('getCurrentSong', () => {
			_warnDeprecated('getCurrentSong()', 'item()');
			return player.item();
		});

		// ── EQ state stubs ────────────────────────────────────────────────
		//
		// v1 exposed equalizerBands, equalizerPresets, equalizerPanning, and
		// equalizerSliderValues as mutable public properties on the player class
		// (Helpers). v2 removed all EQ logic from the core player — EQ is
		// entirely owned by EqualizerPlugin. These stubs return the same
		// default values v1 initialised with so v1 code that reads them can
		// continue functioning without crashing.

		const target = this.player as unknown as Record<string, unknown>;

		/**
		 * @deprecated Removed in v2 — EQ band state is owned by EqualizerPlugin.
		 * Use `player.getPlugin(EqualizerPlugin)?.bands` instead.
		 * Stub returns the v1 default 10-band configuration.
		 */
		if (!('equalizerBands' in target)) {
			const defaultBands: EQBand[] = [
				{
					frequency: 'Pre',
					gain: 0,
				},
				{
					frequency: 70,
					gain: 0,
				},
				{
					frequency: 180,
					gain: 0,
				},
				{
					frequency: 320,
					gain: 0,
				},
				{
					frequency: 600,
					gain: 0,
				},
				{
					frequency: 1000,
					gain: 0,
				},
				{
					frequency: 3000,
					gain: 0,
				},
				{
					frequency: 6000,
					gain: 0,
				},
				{
					frequency: 12000,
					gain: 0,
				},
				{
					frequency: 14000,
					gain: 0,
				},
				{
					frequency: 16000,
					gain: 0,
				},
			];
			Object.defineProperty(target, 'equalizerBands', {
				get: () => {
					_warnRemoved('equalizerBands', 'use EqualizerPlugin.bands instead');
					return defaultBands;
				},
				set: (_value: EQBand[]) => {
					_warnRemoved('equalizerBands = bands', 'use EqualizerPlugin.setBands() instead');
				},
				configurable: true,
				enumerable: false,
			});
			this._patchedMethods.push('equalizerBands');
		}

		/**
		 * @deprecated Removed in v2 — EQ presets are owned by EqualizerPlugin.
		 * Use `player.getPlugin(EqualizerPlugin)?.presets` instead.
		 * Stub returns an empty array so iteration-based v1 code does not crash.
		 */
		if (!('equalizerPresets' in target)) {
			const defaultPresets: EqualizerPreset[] = [];
			Object.defineProperty(target, 'equalizerPresets', {
				get: () => {
					_warnRemoved('equalizerPresets', 'use EqualizerPlugin.presets instead');
					return defaultPresets;
				},
				set: (_value: EqualizerPreset[]) => {
					_warnRemoved('equalizerPresets = presets', 'use EqualizerPlugin instead');
				},
				configurable: true,
				enumerable: false,
			});
			this._patchedMethods.push('equalizerPresets');
		}

		/**
		 * @deprecated Removed in v2 — stereo panning is owned by MixerPlugin.
		 * Use `player.getPlugin(MixerPlugin)?.panning` instead.
		 * Stub returns 0 (center) so v1 code that reads this property continues.
		 */
		if (!('equalizerPanning' in target)) {
			let panValue = 0;
			Object.defineProperty(target, 'equalizerPanning', {
				get: () => {
					_warnRemoved('equalizerPanning', 'use MixerPlugin.panning instead');
					return panValue;
				},
				set: (value: number) => {
					_warnRemoved('equalizerPanning = pan', 'use MixerPlugin.setPanning() instead');
					panValue = value;
				},
				configurable: true,
				enumerable: false,
			});
			this._patchedMethods.push('equalizerPanning');
		}

		/**
		 * @deprecated Removed in v2 — EQ slider ranges are owned by EqualizerPlugin.
		 * Use `player.getPlugin(EqualizerPlugin)?.sliderValues` instead.
		 * Stub returns the v1 default slider configuration.
		 */
		if (!('equalizerSliderValues' in target)) {
			const defaultSliderValues: EQSliderValues = {
				pan: {
					min: -1,
					max: 1,
					step: 0.01,
					default: 0,
				},
				pre: {
					min: -1,
					max: 3,
					step: 1,
					default: 0,
				},
				band: {
					min: -12,
					max: 12,
					step: 0.01,
					default: 0,
				},
			};
			Object.defineProperty(target, 'equalizerSliderValues', {
				get: () => {
					_warnRemoved('equalizerSliderValues', 'use EqualizerPlugin.sliderValues instead');
					return defaultSliderValues;
				},
				configurable: true,
				enumerable: false,
			});
			this._patchedMethods.push('equalizerSliderValues');
		}

		// ── Audio element / visualizer stubs ──────────────────────────────
		//
		// v1 exposed `_audioElement1` and `_audioElement2` as public class fields
		// on Helpers. Each had a `.motion` property (audiomotion-analyzer instance)
		// that visualizer consumers read directly. v2 does not expose raw audio
		// elements or analyzer instances from the player core. Return a frozen stub
		// object with `motion: null` so destructuring reads never throw.

		/** Shape of a stub AudioNode returned for v1 `_audioElement1` / `_audioElement2` access. */
		const audioNodeStub: Readonly<{ motion: null; _audioElement: null }> = Object.freeze({
			motion: null,
			_audioElement: null,
		});

		/**
		 * @deprecated Removed in v2 — direct audio element access is not exposed.
		 * For visualizer integration use a SpectrumPlugin / VisualizerPlugin once
		 * those are available, or wire `AudioContext` via the `audioContext()` method.
		 * The `.motion` property on this stub is always `null`.
		 */
		if (!('_audioElement1' in target)) {
			Object.defineProperty(target, '_audioElement1', {
				get: () => {
					_warnRemoved(
						'_audioElement1',
						'raw audio element access removed; for visualizer use audioContext() + AnalyserNode',
					);
					return audioNodeStub;
				},
				configurable: true,
				enumerable: false,
			});
			this._patchedMethods.push('_audioElement1');
		}

		/**
		 * @deprecated Removed in v2 — see `_audioElement1` stub above.
		 */
		if (!('_audioElement2' in target)) {
			Object.defineProperty(target, '_audioElement2', {
				get: () => {
					_warnRemoved(
						'_audioElement2',
						'raw audio element access removed; for visualizer use audioContext() + AnalyserNode',
					);
					return audioNodeStub;
				},
				configurable: true,
				enumerable: false,
			});
			this._patchedMethods.push('_audioElement2');
		}

		// ── siteTitle / setSiteTitle ──────────────────────────────────────
		//
		// v1 stored `siteTitle` as a protected property on Helpers and used it
		// to build `document.title` when updating the now-playing metadata.
		// v2 has no built-in document.title management — that is consumer or
		// MediaSessionPlugin responsibility.

		let _siteTitle: string = 'NoMercy Player';

		/**
		 * @deprecated Removed in v2 — `document.title` management is a consumer concern.
		 * Use the MediaSessionPlugin for media-session metadata, or set `document.title`
		 * directly in your application code.
		 */
		if (!('siteTitle' in target)) {
			Object.defineProperty(target, 'siteTitle', {
				get: (): string => {
					_warnRemoved(
						'siteTitle',
						'document.title management is a consumer concern in v2; use MediaSessionPlugin or set document.title directly',
					);
					return _siteTitle;
				},
				set: (value: string) => {
					_warnRemoved(
						'siteTitle = value',
						'document.title management is a consumer concern in v2; use MediaSessionPlugin or set document.title directly',
					);
					_siteTitle = value;
				},
				configurable: true,
				enumerable: false,
			});
			this._patchedMethods.push('siteTitle');
		}

		/**
		 * @deprecated Removed in v2 — `document.title` management is a consumer concern.
		 * Set `document.title` directly in your application code instead.
		 */
		this._patchMethod('setSiteTitle', (value: unknown) => {
			_warnRemoved(
				'setSiteTitle(value)',
				'document.title management is a consumer concern in v2; set document.title directly',
			);
			_siteTitle = String(value ?? '');
		});

		// ── playbackRate alias ────────────────────────────────────────────

		/**
		 * @deprecated Use `player.playbackRate(rate)` instead.
		 * v1 had no named setter for playback rate — consumers typically used
		 * `_currentAudio.setPlaybackRate()` directly or duck-typed. Bridge here
		 * for any code that called `setPlaybackRate` on the player instance.
		 */
		this._patchMethod('setPlaybackRate', (rate: unknown) => {
			_warnDeprecated('setPlaybackRate(rate)', 'playbackRate(rate)');
			player.playbackRate(Number(rate));
		});

		/**
		 * @deprecated Use `player.playbackRate()` instead.
		 */
		this._patchMethod('getPlaybackRate', () => {
			_warnDeprecated('getPlaybackRate()', 'playbackRate()');
			return player.playbackRate();
		});

		// ── v1 Helpers data-property shims ───────────────────────────────────
		//
		// v1 exposed many playback state values as plain mutable data properties on
		// the Helpers class (e.g. `player.isPlaying`, `player.currentTime`). v2
		// exposes these as method calls (`player.playState()`, `player.time()`).
		// The property getter stubs below let v1 code that reads these properties
		// continue to work without calling a method.
		//
		// Note: `volume`, `duration`, `buffered`, `playbackRate`, `volumeState`,
		// `baseUrl`, and `isTransitioning` share their name with a v2 method —
		// those are intentionally NOT shimmed here because overriding the method
		// with a property would silently break v2 call-style usage (`player.volume()`
		// would stop working). Consumers relying on these as data properties must
		// migrate. These are documented as HARD PARITY GAPs below.

		const propTarget = this.player as unknown as Record<string, unknown>;

		/**
		 * @deprecated Data-property read of current playhead position.
		 * Use `player.time()` in v2.
		 */
		if (!('currentTime' in propTarget)) {
			Object.defineProperty(propTarget, 'currentTime', {
				get: (): number => {
					_warnDeprecated('currentTime', 'time()');
					return player.time();
				},
				configurable: true,
				enumerable: false,
			});
			this._patchedMethods.push('currentTime');
		}

		/**
		 * @deprecated Data-property read of muted state (boolean).
		 * Use `player.volumeState() === VolumeState.MUTED` in v2.
		 */
		if (!('muted' in propTarget)) {
			Object.defineProperty(propTarget, 'muted', {
				get: (): boolean => {
					_warnDeprecated('muted', 'volumeState()');
					return player.volumeState() === VolumeState.MUTED;
				},
				configurable: true,
				enumerable: false,
			});
			this._patchedMethods.push('muted');
		}

		/**
		 * @deprecated Data-property read of muted state (boolean).
		 * Use `player.volumeState() === VolumeState.MUTED` in v2.
		 */
		if (!('isMuted' in propTarget)) {
			Object.defineProperty(propTarget, 'isMuted', {
				get: (): boolean => {
					_warnDeprecated('isMuted', 'volumeState()');
					return player.volumeState() === VolumeState.MUTED;
				},
				configurable: true,
				enumerable: false,
			});
			this._patchedMethods.push('isMuted');
		}

		/**
		 * @deprecated Data-property read of playing state (boolean).
		 * Use `player.playState() === PlayState.PLAYING` in v2.
		 */
		if (!('isPlaying' in propTarget)) {
			Object.defineProperty(propTarget, 'isPlaying', {
				get: (): boolean => {
					_warnDeprecated('isPlaying', 'playState()');
					return player.playState() === PlayState.PLAYING;
				},
				configurable: true,
				enumerable: false,
			});
			this._patchedMethods.push('isPlaying');
		}

		/**
		 * @deprecated Data-property read of paused state (boolean).
		 * Use `player.playState() === PlayState.PAUSED` in v2.
		 */
		if (!('isPaused' in propTarget)) {
			Object.defineProperty(propTarget, 'isPaused', {
				get: (): boolean => {
					_warnDeprecated('isPaused', 'playState()');
					return player.playState() === PlayState.PAUSED;
				},
				configurable: true,
				enumerable: false,
			});
			this._patchedMethods.push('isPaused');
		}

		/**
		 * @deprecated Data-property read of stopped state (boolean).
		 * Use `player.playState() === PlayState.STOPPED` in v2.
		 */
		if (!('isStopped' in propTarget)) {
			Object.defineProperty(propTarget, 'isStopped', {
				get: (): boolean => {
					_warnDeprecated('isStopped', 'playState()');
					return player.playState() === PlayState.STOPPED;
				},
				configurable: true,
				enumerable: false,
			});
			this._patchedMethods.push('isStopped');
		}

		/**
		 * @deprecated v1 indicated seeking in progress via this boolean.
		 * v2 has no distinct 'seeking' phase — always returns false.
		 * Use backend seek events if you need seek completion signals.
		 */
		if (!('isSeeking' in propTarget)) {
			Object.defineProperty(propTarget, 'isSeeking', {
				get: (): boolean => {
					_warnRemoved('isSeeking', 'v2 has no seeking-phase boolean; listen to time events instead');
					return false;
				},
				configurable: true,
				enumerable: false,
			});
			this._patchedMethods.push('isSeeking');
		}

		/**
		 * @deprecated Data-property read of repeat active state (boolean).
		 * Use `player.repeatState() !== 'off'` in v2.
		 */
		if (!('isRepeating' in propTarget)) {
			Object.defineProperty(propTarget, 'isRepeating', {
				get: (): boolean => {
					_warnDeprecated('isRepeating', "repeatState() !== 'off'");
					return player.repeatState() !== 'off';
				},
				configurable: true,
				enumerable: false,
			});
			this._patchedMethods.push('isRepeating');
		}

		/**
		 * @deprecated Data-property read of shuffle active state (boolean).
		 * Use `player.shuffleState() === 'on'` in v2.
		 */
		if (!('isShuffling' in propTarget)) {
			Object.defineProperty(propTarget, 'isShuffling', {
				get: (): boolean => {
					_warnDeprecated('isShuffling', "shuffleState() === 'on'");
					return player.shuffleState() === 'on';
				},
				configurable: true,
				enumerable: false,
			});
			this._patchedMethods.push('isShuffling');
		}

		/**
		 * @deprecated Data-property read of player state as a v1 PlayerState enum string.
		 * Use `player.playState()` in v2 — returns `PlayState` enum values.
		 *
		 * Maps v2 PlayState to v1 PlayerState strings. `BUFFERING` and `ENDED` are
		 * approximated: BUFFERING uses the buffer state, ENDED is not tracked
		 * separately in v2 and falls through to STOPPED.
		 */
		if (!('state' in propTarget)) {
			Object.defineProperty(propTarget, 'state', {
				get: (): string => {
					_warnDeprecated('state', 'playState()');
					const ps = player.playState();

					// Map v2 PlayState → v1 PlayerState string values.
					switch (ps) {
						case PlayState.PLAYING: return 'PLAYING';
						case PlayState.PAUSED: return 'PAUSED';
						case PlayState.STOPPED: return 'STOPPED';
						case PlayState.LOADING: return 'LOADING';
						case PlayState.ERROR: return 'ERROR';
						case PlayState.IDLE:
						default: return 'IDLE';
					}
				},
				configurable: true,
				enumerable: false,
			});
			this._patchedMethods.push('state');
		}

		/**
		 * @deprecated `fadeDuration` was a protected property on Helpers controlling
		 * the crossfade ramp duration in milliseconds. v2 configures this at setup
		 * via `crossfadeDefaults.duration`. Always returns 0 in v2.
		 */
		if (!('fadeDuration' in propTarget)) {
			Object.defineProperty(propTarget, 'fadeDuration', {
				get: (): number => {
					_warnRemoved('fadeDuration', 'configure via crossfadeDefaults.duration in setup()');
					return 0;
				},
				configurable: true,
				enumerable: false,
			});
			this._patchedMethods.push('fadeDuration');
		}

		/**
		 * @deprecated `newSourceLoaded` was an internal flag on Helpers. No v2
		 * equivalent. Always returns false.
		 */
		if (!('newSourceLoaded' in propTarget)) {
			Object.defineProperty(propTarget, 'newSourceLoaded', {
				get: (): boolean => {
					_warnRemoved('newSourceLoaded', 'no equivalent in v2; listen to the item event instead');
					return false;
				},
				configurable: true,
				enumerable: false,
			});
			this._patchedMethods.push('newSourceLoaded');
		}

		/**
		 * @deprecated `context` was a public AudioContext property on Helpers.
		 * Use `player.audioContext()` in v2.
		 */
		if (!('context' in propTarget)) {
			Object.defineProperty(propTarget, 'context', {
				get: (): AudioContext | undefined => {
					_warnDeprecated('context', 'audioContext()');
					return player.audioContext();
				},
				configurable: true,
				enumerable: false,
			});
			this._patchedMethods.push('context');
		}

		/**
		 * @deprecated `accessToken` was a public getter on Helpers returning the
		 * raw token string. Use `player.auth()?.bearerToken` in v2.
		 */
		if (!('accessToken' in propTarget)) {
			Object.defineProperty(propTarget, 'accessToken', {
				get: (): string | undefined => {
					_warnDeprecated('accessToken', 'auth()?.bearerToken');
					const authCfg = player.auth();
					const token = authCfg?.bearerToken;
					return typeof token === 'string' ? token : undefined;
				},
				configurable: true,
				enumerable: false,
			});
			this._patchedMethods.push('accessToken');
		}
	}
}

/** Plugin alias for {@link V1MusicCompatPlugin}. Pass to `addPlugin(v1MusicCompatPlugin)`. */
export const v1MusicCompatPlugin = V1MusicCompatPlugin;
