import type {
	ActionOptions,
	BaseEventMap,
	BasePlayerConfig,
	BasePlaylistItem,
	IPlayer,
} from '@nomercy-entertainment/nomercy-player-core';
import type { AudioBackendKind, IAudioBackend } from './adapters/audio-backend/IAudioBackend';

export interface ArtistRef {
	id: string | number;
	name: string;
}

export interface AlbumRef {
	id: string | number;
	name: string;
}

/**
 * Default music playlist item shape. Consumers extend with their own
 * fields via the generic on `nmMPlayer<T>('id')`.
 */
export interface MusicPlaylistItem extends BasePlaylistItem {
	name: string;
	cover?: string;
	artistTracks?: ArtistRef[];
	albumTracks?: AlbumRef[];
	url?: string;
	lyricsUrl?: string;
	duration?: number;
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
	'trackEndingSoon': { remaining: number; currentTrack: BasePlaylistItem };
	'crossfadeStart': { from: BasePlaylistItem | null; to: BasePlaylistItem; duration: number };
	'crossfadeComplete': { track: BasePlaylistItem };
}

export interface CrossfadeOptions {
	duration: number;
	curve?: 'linear' | 'equal-power';
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
	crossfadeDefaults?: { duration: number; curve?: 'linear' | 'equal-power' };
	/** Initial playlist — items inline, or a URL fetched and parsed at setup. */
	playlist?: T[] | string;
	/**
	 * Seconds before natural end at which `trackEndingSoon` fires.
	 * AutoAdvancePlugin listens to this for preload and crossfade cues.
	 * Default `10`.
	 */
	trackEndingSoonThreshold?: number;
}
