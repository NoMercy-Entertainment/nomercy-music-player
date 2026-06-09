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
 *
 * Registration:
 * ```ts
 * import { V1MusicCompatPlugin } from '@nomercy-entertainment/nomercy-music-player/plugins/v1-compat';
 * player.addPlugin(V1MusicCompatPlugin);
 * ```
 */

import type { NMMusicPlayer } from '../../index';
import type { MusicPlaylistItem } from '../../types';
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
	const v2 = v2Data as { time?: number } | undefined;
	const position = v2?.time ?? 0;
	return {
		buffered: 0,
		duration: 0,
		percentage: 0,
		position,
		remaining: 0,
	};
}

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
		// v1 'song' fired with BasePlaylistItem | null; v2 uses 'current' with { item, index }.
		song: {
			v2Event: 'current',
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
	};
}

// ---------------------------------------------------------------------------
// Plugin events
// ---------------------------------------------------------------------------

/** Events emitted by {@link V1MusicCompatPlugin} (none — pure shim). */
export type V1MusicCompatEvents = Record<string, never>;

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
	Record<string, never>,
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
			if (mapping) {
				_warnDeprecated(`on('${event}')`, `on('${mapping.v2Event}')`);
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
		 */
		this._patchMethod('currentSong', () => {
			_warnDeprecated('currentSong', 'item()');
			return player.item();
		});

		/**
		 * @deprecated Use `player.item(track)` and pass `tracks` as `player.queue(tracks)`.
		 */
		this._patchMethod('playTrack', (trackItem: unknown, tracksArray?: unknown) => {
			_warnDeprecated('playTrack(track, tracks?)', 'item(track) and queue(tracks)');
			if (tracksArray !== undefined) {
				player.queue(tracksArray as MusicPlaylistItem[]);
			}
			if (trackItem !== null && trackItem !== undefined) {
				player.item(trackItem as MusicPlaylistItem);
			}
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
	}
}

/** Plugin alias for {@link V1MusicCompatPlugin}. Pass to `addPlugin(v1MusicCompatPlugin)`. */
export const v1MusicCompatPlugin = V1MusicCompatPlugin;
