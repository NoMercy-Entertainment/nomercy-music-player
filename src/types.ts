import type {
	ActionOptions,
	BaseEventMap,
	BasePlayerConfig,
	BasePlaylistItem,
	CrossfadeCurve,
	IPlayer,
} from '@nomercy-entertainment/nomercy-player-core';
import type { AudioBackendKind, IAudioBackend } from './adapters/audio-backend/IAudioBackend';

/**
 * Default music playlist item shape. Consumers extend with their own
 * fields via the generic on `nmMPlayer<T>('id')`.
 */
export interface MusicPlaylistItem extends BasePlaylistItem {
	name: string;
	/**
	 * Cover art URL. `null` is accepted as a sentinel for "no art available"
	 * so that consumers that store `cover: string | null` (common with database
	 * nullable columns) compile without changes.
	 */
	cover?: string | null;
	/** Plain artist name string. Consumers with linked-entity data join or pick the primary. */
	artist?: string;
	/** Plain album name string. Consumers with linked-entity data join or pick the primary. */
	album?: string;
	url?: string;
	lyricsUrl?: string;
	/**
	 * Track duration in seconds. Also accepts a human-readable string
	 * (e.g. `'3:42'`) so consumer item types that declare `duration: string`
	 * satisfy this constraint without source changes.
	 */
	duration?: number | string;
}

/** Volume gain stage. Returned by `player.volumeState()`. */
export enum VolumeState {
	UNMUTED = 'unmuted',
	MUTED = 'muted',
}

/** Top-level playback state. Returned by `player.playState()`. */
export enum PlayState {
	IDLE = 'idle',
	LOADING = 'loading',
	PLAYING = 'playing',
	PAUSED = 'paused',
	STOPPED = 'stopped',
	ERROR = 'error',
}

/** Repeat mode. Returned by `player.repeatState()`. */
export enum RepeatState {
	OFF = 'off',
	ALL = 'all',
	ONE = 'one',
}

/** Shuffle mode. Returned by `player.shuffleState()`. */
export enum ShuffleState {
	OFF = 'off',
	ON = 'on',
}

export type { AudioBackendKind } from './adapters/audio-backend/IAudioBackend';

/** Re-exported from kit — canonical definition lives in nomercy-player-core. */
export { AudioTrackState, QualityState } from '@nomercy-entertainment/nomercy-player-core';

/** Aggregated time state — re-exported from the kit. */
export type { TimeState } from '@nomercy-entertainment/nomercy-player-core';

/**
 * Music-specific events on top of `BaseEventMap`.
 *
 * Cursor change is signalled by `BaseEventMap.current` — listen to that for
 * "current track changed". Music adds events for repeat / shuffle / crossfade /
 * backend / EQ that don't apply to other player libraries.
 *
 * `'mute'` and `'volume'` are inherited from `BaseEventMap` — not re-declared here.
 */
export interface MusicEventMap extends BaseEventMap {
	'current': { item: MusicPlaylistItem | undefined; index: number };
	'backend:changed': { kind: AudioBackendKind };
	'repeat': { state: RepeatState };
	'shuffle': { state: ShuffleState };
	'trackEndingSoon': { remaining: number; currentTrack: MusicPlaylistItem };
	'crossfadeStart': { from: MusicPlaylistItem | null; to: MusicPlaylistItem; duration: number };
	'crossfadeComplete': { track: MusicPlaylistItem };
	/**
	 * Time event payload. Extends the kit `BaseEventMap['time']` with extra
	 * convenience fields:
	 *
	 * - `time` — elapsed seconds (always present)
	 * - `percentage` — elapsed time as 0–100 percent of total duration
	 * - `position` — alias for `time` in seconds
	 * - `duration` — total duration in seconds
	 * - `remaining` — remaining seconds
	 */
	'time': {
		time: number;
		percentage: number;
		position: number;
		duration: number;
		remaining: number;
	};
}

export type { CrossfadeCurve };

export interface CrossfadeOptions {
	duration: number;
	curve?: CrossfadeCurve;
	/** Start position of the incoming track in milliseconds (default 0). */
	startAt?: number;
}

/**
 * Custom backend factory. Receives the resolved backend kind and the player
 * options; returns an `IAudioBackend` impl. Use this to inject WebCodecs,
 * native-shell bridges (Capacitor `<audio>`), or experimental backends without
 * subclassing the player.
 */
export type AudioBackendFactory = (
	kind: AudioBackendKind,
	config: MusicPlayerConfig<BasePlaylistItem>,
) => IAudioBackend;

/**
 * Library-specific player contract. Consumers who accept either music or video
 * players but need music-specific methods (crossfade, backend swap) should type
 * their parameter as `IMusicPlayer` rather than `IPlayer<MusicEventMap>`.
 */
export interface IMusicPlayer<T extends BasePlaylistItem = MusicPlaylistItem>
	extends IPlayer<MusicEventMap> {
	backend(): IAudioBackend;
	backend(kind: AudioBackendKind): Promise<void>;
	crossfadeTo(track: T, opts?: CrossfadeOptions & ActionOptions): Promise<void>;
	isTransitioning(): boolean;
}

/** Music player configuration. */
export interface MusicPlayerConfig<T extends BasePlaylistItem = MusicPlaylistItem> extends BasePlayerConfig {
	backend?: AudioBackendKind;
	/**
	 * Custom backend factory. When supplied, overrides the kit's default
	 * `audio-element` / `webaudio` resolution. Receives the resolved kind so
	 * factories can branch on it (or ignore it and return a single impl).
	 */
	backendFactory?: AudioBackendFactory;
	/** Default crossfade applied to every `crossfadeTo` unless overridden per-call. */
	crossfadeDefaults?: { duration: number; curve?: CrossfadeCurve };
	/** Initial playlist — items inline, or a URL fetched and parsed at setup. */
	playlist?: T[] | string;
	/**
	 * Seconds before natural end at which `trackEndingSoon` fires.
	 * AutoAdvancePlugin listens to this for preload and crossfade cues.
	 * Default `10`.
	 */
	trackEndingSoonThreshold?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// v1 compatibility types
//
// Exported from the `/types` and `/dist/types` subpaths so v1 consumer code
// that imported these from `@nomercy-entertainment/nomercy-music-player/dist/types`
// continues to compile without source changes.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Single equalizer band.
 * @deprecated Use the EqualizerPlugin API in new code.
 */
export interface EQBand {
	/** Frequency in Hz, or `'Pre'` for the pre-amplifier gain band. */
	frequency: number | 'Pre';
	/** Gain in dB. */
	gain: number;
}

/**
 * Slider range config for each equalizer control.
 * @deprecated Use the EqualizerPlugin API in new code.
 */
export interface EQSliderValues {
	pan: { min: number; max: number; step: number; default: number };
	pre: { min: number; max: number; step: number; default: number };
	band: { min: number; max: number; step: number; default: number };
}

/**
 * Named equalizer preset.
 * @deprecated Use the EqualizerPlugin API in new code.
 */
export interface EqualizerPreset {
	name: string;
	values: Array<{ frequency: number; gain: number }>;
}

/**
 * Simple id + name item used by server list endpoints (genres, directors, etc.).
 *
 * @deprecated Declare this interface in your own app types.
 */
export interface Item {
	id: number | string;
	name: string;
	[key: string]: unknown;
}
