// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type {
	ActionOptions,
	AriaLiveLevel,
	AudioTrack,
	AuthConfig,
	BasePlaylistItem,
	BufferState,
	CanPlayResult,
	CastState,
	CastTarget,
	Chapter,
	CurrentAudioTrackSelection,
	CurrentQualitySelection,
	CurrentSubtitleSelection,
	DeviceCapabilities,
	ICueParser,
	IPlatform,
	IPlayer,
	IPreloadStrategy,
	IStreamFactory,
	ITransitionStrategy,
	IUrlResolver,
	TimeState as KitTimeState,
	LoadOptions,
	NetworkState,
	PlaybackMetrics,
	PlayerExperimental,
	PlayerPhase,
	Plugin,
	PluginCtorWithId,
	QualityLevel,
	ResolvedUrl,
	SetupState,
	SubtitleTrack,
	Translations,
	UrlCategory,
	VisibilityState,
} from '@nomercy-entertainment/nomercy-player-core';
import type { BackendEventPayload, IAudioBackend } from './adapters/audio-backend/IAudioBackend';
import type {
	AudioBackendKind,
	AudioTrackState,
	CrossfadeOptions,
	IMusicPlayer,
	MusicEventMap,
	MusicPlayerConfig,
	MusicPlaylistItem,
	QualityState,
	RepeatState,
	ShuffleState,
	VolumeState,
} from './types';
import {
	bridgeBackendPlayState,
	composeMixins,
	CrossfadeTransitionStrategy,
	EventEmitter,
	initPlayerCoreState,
	MediaFormatError,
	NotImplementedError,
	playerCoreMethods,
	resolvePlayerConstructor,
	setPlayerAudioContext,
} from '@nomercy-entertainment/nomercy-player-core';
import { AudioElementBackend } from './adapters/audio-backend/html5-audio';
import { WebAudioBackend } from './adapters/audio-backend/web-audio';
import { MusicPreloadStrategy } from './player/preload';
import { PlayState } from './types';

export { MusicPreloadStrategy } from './player/preload';

export { V1MusicCompatPlugin } from './plugins/v1-compat';
export type {
	AudioBackendKind,
	CrossfadeCurve,
	CrossfadeOptions,
	IMusicPlayer,
	MusicEventMap,
	MusicPlayerConfig,
	MusicPlaylistItem,
	TimeState,
} from './types';
export {
	AudioTrackState,
	PlayState,
	QualityState,
	RepeatState,
	ShuffleState,
	VolumeState,
} from './types';
export { NotImplementedError } from '@nomercy-entertainment/nomercy-player-core';

const _instances = new Map<string, NMMusicPlayer<MusicPlaylistItem>>();

/**
 * Narrow view of the composed kit internals accessed by `_wireBackend`.
 * These fields are written onto the instance by playerCoreMethods via
 * composeMixins — they exist at runtime but are not declared on the class
 * (they live on the Internals interface in the kit). The cast is isolated
 * inside `_wireBackend`; all mutations go through the declared helpers or
 * direct assignment on the typed surface.
 */
interface WireInternals {
	_phase: PlayerPhase;
	_playState: PlayState;
	_transitionPhase: (next: PlayerPhase) => void;
	_checkItemEndingSoon: (currentTime: number, duration: number) => void;
}

/**
 * Headless music player. Plugin-driven, event-driven, no UI in core.
 *
 * The shared player core (lifecycle, transport, queue, state, volume, time,
 * plugins, i18n, cue parsers, baseUrl, audioContext, experimental override
 * surface) is composed onto the prototype from `playerCoreMethods` exported by
 * `@nomercy-entertainment/nomercy-player-core` — the LOGIC lives there, not
 * here. NMMusicPlayer adds only:
 *
 *  - The per-library registry (own `_instances` Map)
 *  - The three-form factory constructor
 *  - Library-typed method declarations (so consumers see `PlayState`, not
 *    the kit's internal string token — the runtime impl comes from the mixin)
 *  - Music-specific stubs (backends, crossfade, audio output devices, etc.)
 */
export class NMMusicPlayer<T extends MusicPlaylistItem = MusicPlaylistItem>
	extends EventEmitter<MusicEventMap<T>>
	implements IPlayer<MusicEventMap<T>>, IMusicPlayer<T> {
	readonly playerId: string = '';
	container: HTMLElement = <HTMLElement>{};

	get id(): string {
		return this.playerId;
	}

	/**
	 * Phantom brand — never assigned at runtime. Declared explicitly here so
	 * `PlayerEventMap<NMMusicPlayer<T>>` resolves to `MusicEventMap` without
	 * TypeScript having to walk the `EventEmitter` inheritance chain (which
	 * stalls in conditional-type inference for complex class hierarchies).
	 */
	declare readonly __eventMap__: MusicEventMap<T>;

	declare options: MusicPlayerConfig<T>;

	// ── Type-only declarations for the methods composed in from the kit's
	// `playerCoreMethods`. The bodies live in the kit; these declarations let
	// consumers see the music-typed contract without runtime cost.

	declare setup: (config: MusicPlayerConfig<T>) => this;
	declare ready: () => Promise<void>;
	declare dispose: () => void;
	declare setupState: () => SetupState;
	declare phase: () => PlayerPhase;
	declare dispatching: () => ReadonlyArray<string>;

	declare baseUrl: {
		(): string | undefined;
		(url: string): void;
	};

	declare audioContext: () => AudioContext | undefined;
	declare experimental: PlayerExperimental;

	declare t: {
		(key: string, vars?: Record<string, string>): string;
		(PluginClass: PluginCtorWithId, key: string, vars?: Record<string, string>): string;
	};

	declare language: {
		(): string;
		(lang: string): Promise<void>;
	};

	declare addTranslations: (bundle: Translations) => void;
	declare translation: {
		(lang: string, key: string): string | undefined;
		(lang: string, key: string, value: string): void;
	};

	declare removeTranslations: (prefix: string, lang?: string) => void;

	declare registerCueParser: (parser: ICueParser, prepend?: boolean) => void;
	declare unregisterCueParser: (id: string) => void;
	declare resolveCueParser: (url: string) => ICueParser | undefined;

	declare play: (opts?: ActionOptions) => Promise<void>;
	declare pause: (opts?: ActionOptions) => Promise<void>;
	declare stop: (opts?: ActionOptions) => Promise<void>;
	declare togglePlayback: (opts?: ActionOptions) => Promise<void>;
	declare next: (opts?: LoadOptions) => Promise<void>;
	declare previous: (opts?: LoadOptions) => Promise<void>;
	declare rewind: (seconds?: number, opts?: ActionOptions) => Promise<void>;
	declare forward: (seconds?: number, opts?: ActionOptions) => Promise<void>;
	declare restart: (opts?: ActionOptions) => Promise<void>;
	declare registerTitleTokens: (tokens: Record<string, string>) => void;

	declare time: {
		(): number;
		(seconds: number, opts?: ActionOptions): Promise<void>;
	};

	declare duration: () => number;
	declare buffered: () => number;
	declare bufferedRanges: () => TimeRanges;
	declare seekable: () => TimeRanges;
	declare timeData: () => KitTimeState;
	/** Seek to a position expressed as a percentage (0–100) of total duration. */
	declare seekByPercentage: (pct: number, opts?: ActionOptions) => void;

	declare playbackRate: {
		(): number;
		(rate: number): void;
	};

	declare playbackRates: () => number[];

	declare volume: {
		(): number;
		(level: number): void;
	};

	declare mute: () => void;
	declare unmute: () => void;
	declare toggleMute: () => void;
	declare volumeUp: (step?: number) => void;
	declare volumeDown: (step?: number) => void;

	declare playState: () => PlayState;
	declare volumeState: () => VolumeState;
	declare repeatState: {
		(): RepeatState;
		(state: RepeatState): void;
	};

	declare shuffleState: {
		(): ShuffleState;
		(state: ShuffleState | boolean): void;
	};

	declare queue: {
		(): ReadonlyArray<T>;
		(items: T[], opts?: ActionOptions): void;
	};

	declare queueAppend: (item: T | T[], opts?: ActionOptions) => void;
	declare queuePrepend: (item: T | T[], opts?: ActionOptions) => void;
	declare queueInsert: (item: T | T[], index: number, opts?: ActionOptions) => void;
	declare queueRemove: (id: string | number, opts?: ActionOptions) => void;
	declare queueRemoveAt: (index: number, opts?: ActionOptions) => void;
	declare queueMove: (from: number, to: number, opts?: ActionOptions) => void;
	declare queueClear: (opts?: ActionOptions) => void;
	declare queueShuffle: (opts?: ActionOptions) => void;
	declare queueSort: (compare: (itemA: T, itemB: T) => number, opts?: ActionOptions) => void;
	declare peekNext: () => T | undefined;
	declare peekPrevious: () => T | undefined;
	declare queueLength: () => number;
	declare queueIndexOf: (id: string | number) => number;

	declare item: {
		(): T | undefined;
		(target: T | string | number, opts?: LoadOptions): void;
	};

	declare index: () => number;
	declare seekToIndex: (position: number, opts?: ActionOptions) => void;

	declare playItem: (
		target: BasePlaylistItem | string | number | ((item: BasePlaylistItem) => boolean),
		opts?: LoadOptions,
	) => void;

	declare playNow: (
		items: BasePlaylistItem[],
		start?: BasePlaylistItem | string | number | ((item: BasePlaylistItem) => boolean),
		opts?: LoadOptions,
	) => void;

	declare backlog: {
		(): ReadonlyArray<T>;
		(items: T[]): void;
	};

	declare backlogAppend: (item: T | T[]) => void;
	declare backlogRemove: (id: string | number) => void;
	declare backlogClear: () => void;

	declare addPlugin: <P extends Plugin<any, any, any>>(PluginClass: PluginCtorWithId & (new () => P), opts?: P['opts']) => this;
	declare getPlugin: <P extends object>(PluginClass: PluginCtorWithId & (new () => P)) => P | undefined;
	declare getPluginById: <P extends object = object>(id: string) => P | undefined;
	declare removePlugin: <P extends Plugin<any, any, any>>(PluginClass: PluginCtorWithId & (new () => P)) => void;
	declare removePluginById: (id: string) => void;
	declare plugins: () => ReadonlyArray<Plugin>;
	declare enabledPlugins: () => ReadonlyArray<Plugin>;

	constructor(id?: string | number) {
		super();
		// Resolve before initPlayerCoreState: the existing-instance branch returns
		// early, and re-initializing core state on a live instance corrupts it.
		const resolved = resolvePlayerConstructor(id, _instances, 'NMMusicPlayer');
		if (resolved.kind === 'existing') {
			return resolved.instance as unknown as this; // polymorphic return: resolved instance IS this subclass
		}

		initPlayerCoreState(this, { className: 'NMMusicPlayer' });
		(this as { playerId: string }).playerId = resolved.id;
		this.container = resolved.div;
		_instances.set(resolved.id, this as unknown as NMMusicPlayer<MusicPlaylistItem>); // registry stores the base item type; subclass is assignment-compatible
	}

	/** Test-only: clear the registry. Not part of the public API. */
	static _resetRegistry(): void {
		_instances.clear();
	}

	// ── Stream registration ── composed in via `streamRegistrationMethods` mixin.
	declare registerStream: (factory: IStreamFactory, prepend?: boolean) => this;
	declare unregisterStream: (id: string) => this;
	declare streams: () => ReadonlyArray<string>;
	declare getStreamFactory: (id: string) => IStreamFactory | undefined;

	// ── Backend ──
	// The active audio backend. `_isTransitioning` flips true during a crossfade
	// so that simultaneous calls are rejected. The crossfade dual-buffer logic
	// lives inside each backend implementation (loadSecondary / crossfade / etc.).
	private _backend?: IAudioBackend;
	private _isTransitioning = false;

	private _createBackend(kind: AudioBackendKind, opts: MusicPlayerConfig<T> | undefined): IAudioBackend {
		const factory = opts?.backendFactory;
		if (factory)
			return factory(kind, opts as MusicPlayerConfig<BasePlaylistItem>);
		if (kind === 'webaudio')
			return new WebAudioBackend(this.container);
		return new AudioElementBackend(this.container);
	}

	backend(): IAudioBackend;
	backend(kind: AudioBackendKind): Promise<void>;
	backend(kind?: AudioBackendKind): IAudioBackend | Promise<void> {
		if (kind === undefined) {
			if (!this._backend) {
				const opts = this.options as MusicPlayerConfig<T> | undefined;
				const configKind = opts?.backend ?? 'audio-element';
				this._backend = this._createBackend(configKind, opts);
				this._wireBackend(this._backend);
			}
			return this._backend;
		}
		return Promise.resolve().then(() => {
			if (this._backend) {
				this._backend.dispose();
				this._backend = undefined;
			}
			const opts = this.options as MusicPlayerConfig<T> | undefined;
			this._backend = this._createBackend(kind, opts);
			this._wireBackend(this._backend);
			this.emit('backend:changed', { kind });
		});
	}

	private _firstFrameEmitted = false;

	private _makeTimeupdateHandler(instance: IAudioBackend): () => void {
		return () => {
			const currentTime = instance.currentTime();
			const totalDuration = instance.duration();
			const safeD = Number.isFinite(totalDuration) && totalDuration > 0 ? totalDuration : 0;
			const percentage = safeD > 0 ? (currentTime / safeD) * 100 : 0;
			const remaining = safeD > 0 ? safeD - currentTime : 0;

			this.emit('time', {
				time: currentTime,
				percentage,
				position: currentTime,
				duration: safeD,
				remaining,
			});

			// Core fires `itemEndingSoon` when the threshold is crossed.
			// `_checkItemEndingSoon` is idempotent — it latches internally.
			(this as unknown as WireInternals)._checkItemEndingSoon(currentTime, safeD);
		};
	}

	private _makeLoadedMetadataHandler(instance: IAudioBackend): () => void {
		// Read duration from the backend. If the backend hasn't resolved a valid
		// duration yet (returns NaN / 0), fall back to the item's consumer-supplied
		// `duration` field so seekbars have a length before metadata arrives.
		return () => {
			const backendDuration = instance.duration();
			if (backendDuration > 0) {
				this.emit('duration', { duration: backendDuration });
				return;
			}
			const itemDuration = this.item?.()?.duration;
			if (typeof itemDuration === 'number' && itemDuration > 0) {
				this.emit('duration', { duration: itemDuration });
			}
		};
	}

	private _makePlayStateHandlers(instance: IAudioBackend): void {
		const internals = this as unknown as WireInternals; // accesses private phase fields not on the public type

		instance.on('canplay', () => {
			if (this._firstFrameEmitted)
				return;
			this._firstFrameEmitted = true;

			if (internals._phase === 'starting') {
				internals._transitionPhase('playing');
			}

			this.emit('firstFrame', undefined);
		});

		// `onPlayEvent` covers the phase transition 'starting' → 'playing' on
		// every raw `play` event, even when `_playState` was already `PLAYING`
		// — needed for the "load → wait → play" pattern where `canplay`
		// already fired during load (setting `_firstFrameEmitted = true`) and
		// won't re-fire on `instance.play()`.
		bridgeBackendPlayState<BackendEventPayload>(instance, {
			isPlaying: () => internals._playState === PlayState.PLAYING,
			setPlaying: (playing) => {
				internals._playState = playing ? PlayState.PLAYING : PlayState.PAUSED;
			},
			onPlay: () => { this.emit('play', undefined); },
			onPlayEvent: () => {
				if (internals._phase === 'starting') {
					internals._transitionPhase('playing');
				}
			},
			onPlaying: () => { this.emit('playing', undefined); },
			onPause: () => { this.emit('pause', undefined); },
			onReset: () => { this._firstFrameEmitted = false; },
		});

		instance.on('ended', () => {
			if (internals._phase !== 'ended') {
				internals._transitionPhase('ended');
			}
			this.emit('ended', undefined);
		});
	}

	private _wireBackend(instance: IAudioBackend): void {
		this._firstFrameEmitted = false;

		// Authenticated media servers need the Authorization header on every
		// hls.js manifest/segment request. The provider reads the auth config
		// lazily so getter-style tokens (Vue refs, stores) stay live.
		instance.setAuthHeaderProvider?.(async () => {
			const bearer = this.options?.auth?.bearerToken;
			if (!bearer)
				return undefined;
			const token = typeof bearer === 'function' ? await bearer() : bearer;
			return token ? `Bearer ${token}` : undefined;
		});

		// AudioElementBackend has no audioContext(); only WebAudioBackend does.
		// Registering it here keeps AudioGraphPlugin on the one shared context.
		if (typeof instance.audioContext === 'function') {
			setPlayerAudioContext(this, instance.audioContext());
		}

		this._makePlayStateHandlers(instance);
		instance.on('timeupdate', this._makeTimeupdateHandler(instance));
		instance.on('loadedmetadata', this._makeLoadedMetadataHandler(instance));
	}

	// ── Loading ── composed in via `loadingMethods` mixin.
	declare load: (item: T, opts?: LoadOptions) => Promise<void>;
	declare loadQueue: (url: string, parser?: (raw: string) => T[]) => Promise<void>;

	// ── Crossfade — dual-element implementation ──
	/** Fade the active element out while a second element fades in, then swap them. Ignored while a crossfade is already in flight. */
	async crossfadeTo(item: T, opts?: CrossfadeOptions & ActionOptions): Promise<void> {
		if (this._isTransitioning)
			return; // idempotent guard — reject stacked crossfades

		const durationMs = ((opts?.duration ?? this.options?.crossfadeDefaults?.duration ?? 5) * 1000);
		const url = item.url;
		if (!url) {
			throw new MediaFormatError({
				code: 'core:media/missing-url',
				severity: 'error',
				scope: { kind: 'core' },
				message: 'crossfadeTo(item) requires `item.url` to be present.',
				context: { id: item.id },
			});
		}

		const backend = this.backend();
		const fromItem = this.item?.() ?? null;

		this._isTransitioning = true;
		this.emit('crossfadeStart', {
			from: fromItem,
			to: item,
			duration: durationMs,
		});

		try {
			// Delegate all dual-buffer logic to the backend.
			await backend.loadSecondary(url);
			await backend.primeSecondary(opts?.startAt);
			await backend.crossfade(durationMs);
		}
		catch (err) {
			this._isTransitioning = false;
			throw err;
		}

		// Advance the cursor so `item()` reflects the new item. The setter
		// overload emits the `current` event, which downstream plugins
		// (mediaSession, lyrics, autoAdvance) listen to.
		this.item?.(item.id ?? item);

		this._isTransitioning = false;
		this.emit('crossfadeComplete', { item });
	}

	isTransitioning(): boolean {
		return this._isTransitioning;
	}

	// ── Shared state methods ── composed in via `playerStateMethods` mixin.
	declare bufferState: () => BufferState;
	declare networkState: () => NetworkState;
	declare streamState: () => string;
	declare visibilityState: () => VisibilityState;
	declare qualityMode: {
		(): QualityState;
		(target: number | 'auto'): void;
	};

	declare audioTrackMode: {
		(): AudioTrackState;
		(idx: number): void;
	};

	// ── Platform + device capabilities ── composed in via `lifecycle` / `deviceMethods` mixins.
	declare platform: () => IPlatform;
	declare isTv: () => boolean;
	declare isMobile: () => boolean;
	declare isDesktop: () => boolean;
	declare device: () => DeviceCapabilities;

	// ── MediaCapabilities + ABR ── composed in via `abrMethods` mixin.
	declare canPlay: (profile: { contentType: string; width?: number; height?: number; bitrate?: number; framerate?: number }) => Promise<CanPlayResult>;
	declare bandwidth: () => number;
	declare bandwidthEstimator: {
		(): (() => number) | undefined;
		(fn: () => number): void;
	};

	// ── Audio output device ── composed in via `audioOutputMethods` mixin.
	declare audioOutputs: () => Promise<MediaDeviceInfo[]>;
	declare selectAudioOutput: () => Promise<MediaDeviceInfo | null>;
	declare audioOutput: {
		(): Promise<string | null>;
		(deviceId: string): Promise<void>;
	};

	// ── Tracks / chapters / quality ── composed in via `mediaTracksMethods` mixin.
	// `subtitles`, `subtitle`, and `subtitleStyle` are overridden below the class
	// to throw `NotImplementedError` — these are screen-domain concerns with no
	// meaning on an audio backend.
	declare subtitles: () => SubtitleTrack[];
	declare subtitle: {
		(): CurrentSubtitleSelection | null;
		(idx: number | null): void;
	};

	declare subtitleStyle: {
		(): import('@nomercy-entertainment/nomercy-player-core').SubtitleStyle;
		(patch: Partial<import('@nomercy-entertainment/nomercy-player-core').SubtitleStyle>): void;
	};

	declare audioTracks: () => AudioTrack[];
	declare audioTrack: {
		(): CurrentAudioTrackSelection | null;
		(idx: number): void;
	};

	declare qualityLevels: {
		(): QualityLevel[];
		(opts: { includeUnsupported: true }): QualityLevel[];
	};

	declare quality: {
		(): CurrentQualitySelection | 'auto';
		(idx: number | 'auto'): void;
	};

	declare chapters: () => Chapter[];
	declare chapter: {
		(): Chapter | null;
		(idx: number): void;
	};

	declare seekToChapter: (idx: number, opts?: ActionOptions) => void;
	declare nextChapter: (opts?: ActionOptions) => void;
	declare previousChapter: (opts?: ActionOptions) => void;

	// ── Cast / handoff ── composed in via `castMethods` mixin.
	declare castState: () => CastState;
	declare transferTo: (target: CastTarget) => Promise<void>;

	// ── Auth runtime mutation ── composed in via `authMethods` mixin.
	declare auth: {
		(): Readonly<AuthConfig> | undefined;
		(config: AuthConfig): void;
		(partial: Partial<AuthConfig>): void;
		(clear: null): void;
	};

	declare refreshAuth: () => Promise<void>;
	declare resolveUrl: (url: string, category?: UrlCategory) => Promise<ResolvedUrl>;
	declare urlResolver: {
		(): IUrlResolver | undefined;
		(resolver: IUrlResolver | undefined): void;
	};

	// ── Performance metrics / clock / accessibility ── composed in via `metricsMethods` mixin.
	declare metrics: () => PlaybackMetrics;
	declare recordMetric: (name: string, value: number) => void;
	declare now: () => number;
	declare announce: (text: string, level?: AriaLiveLevel) => void;

	// ── Preload + transition strategies ── composed via `preloadStrategyMethods` mixin.
	declare setPreloadStrategy: (strategy: IPreloadStrategy) => void;
	declare setTransitionStrategy: (strategy: ITransitionStrategy) => void;
	declare preloadStrategy: () => IPreloadStrategy;
	declare transitionStrategy: () => ITransitionStrategy;

	// ── DOM construction helpers ── composed via `domMethods` mixin.
	declare createElement: IPlayer<MusicEventMap>['createElement'];
	declare createButton: IPlayer<MusicEventMap>['createButton'];
	declare createSVG: IPlayer<MusicEventMap>['createSVG'];
	declare addClasses: IPlayer<MusicEventMap>['addClasses'];
	declare removeClasses: IPlayer<MusicEventMap>['removeClasses'];
}

// Compose every shared player method onto the prototype. The kit's logic
// gets wired into the class here — no inheritance, no per-library duplication.
composeMixins(NMMusicPlayer.prototype, ...playerCoreMethods);

// Override mixin-installed `subtitles()` — audio backends don't expose subtitle
// tracks. Throw so consumers know this is structural, not just an empty list.
NMMusicPlayer.prototype.subtitles = function (): never {
	throw new NotImplementedError(
		'Music backends don\'t expose subtitle tracks. Use a video player for subtitle support.',
		'subtitles',
	);
};

// Override mixin-installed `subtitle()` — reading or selecting a subtitle track
// is a screen-domain concern that has no meaning on an audio backend.
NMMusicPlayer.prototype.subtitle = function (): never {
	throw new NotImplementedError(
		'Subtitle track selection is not supported on the music player. Use a video player for subtitle support.',
		'subtitle',
	);
};

// Override mixin-installed `subtitleStyle()` — subtitle rendering style is a
// screen-domain concern that has no meaning on an audio backend.
NMMusicPlayer.prototype.subtitleStyle = function (): never {
	throw new NotImplementedError(
		'Subtitle style is not supported on the music player. Use a video player for subtitle support.',
		'subtitleStyle',
	);
};

{
	const composedDispose: () => void = NMMusicPlayer.prototype.dispose;
	NMMusicPlayer.prototype.dispose = function (this: NMMusicPlayer<MusicPlaylistItem>): void {
		const self = this as unknown as { _backend?: IAudioBackend }; // dispose needs write access to the private _backend field
		try { self._backend?.dispose?.(); }
		catch { /* defensive — kit must still finish disposing */ }
		self._backend = undefined;
		_instances.delete(this.playerId);
		composedDispose.call(this);
	};
}

// Wrap the kit-composed `setup` with the music-domain defaults every entry
// point must get. This lives on the class, not in a factory, so `nmplayer()`
// and `new NMMusicPlayer()` both behave identically.
{
	type _KitSetupFn = (config: MusicPlayerConfig<MusicPlaylistItem>) => NMMusicPlayer<MusicPlaylistItem>;
	const kitSetup: _KitSetupFn = NMMusicPlayer.prototype.setup as _KitSetupFn;
	const wrappedSetup: _KitSetupFn = function (this: NMMusicPlayer<MusicPlaylistItem>, config: MusicPlayerConfig<MusicPlaylistItem>): NMMusicPlayer<MusicPlaylistItem> {
		// Music defaults to crossfading between tracks. Consumer-supplied
		// strategies always win — only inject when absent.
		const leadSeconds = config.preloadLeadSeconds ?? 10;
		const crossfadeLeadSeconds = config.crossfadeLeadSeconds ?? 3;
		const crossfadeTailSeconds = config.crossfadeTailSeconds ?? 3;
		const itemEndingSoonThreshold = config.itemEndingSoonThreshold;

		const enrichedConfig: MusicPlayerConfig<MusicPlaylistItem> = {
			crossfadeEnabled: true,
			...config,
			preloadLeadSeconds: leadSeconds,
			crossfadeLeadSeconds,
			crossfadeTailSeconds,
			...(itemEndingSoonThreshold !== undefined ? { itemEndingSoonThreshold } : {}),
			preloadStrategy: config.preloadStrategy ?? new MusicPreloadStrategy(leadSeconds),
			transitionStrategy: config.transitionStrategy ?? new CrossfadeTransitionStrategy({
				leadSeconds: crossfadeLeadSeconds,
				tailSeconds: crossfadeTailSeconds,
				curve: config.crossfadeDefaults?.curve ?? 'equal-power',
			}),
		};
		const instance = kitSetup.call(this, enrichedConfig);

		return instance;
	};
	Object.defineProperty(NMMusicPlayer.prototype, 'setup', {
		value: wrappedSetup,
		writable: true,
		configurable: true,
	});
}

/**
 * Canonical v2 entry point.
 *
 * Returns an `NMMusicPlayer` instance — no compat shims, the fully typed v2
 * surface and nothing else.
 *
 * ```ts
 * import nmplayer from '@nomercy-entertainment/nomercy-music-player';
 * nmplayer('my-div').setup({ ...config });
 * ```
 */
export function nmplayer<T extends MusicPlaylistItem = MusicPlaylistItem>(id?: string | number): NMMusicPlayer<T> {
	return new NMMusicPlayer<T>(id);
}

/**
 * Default export is the canonical `nmplayer` factory — clean v2, no v1 baggage.
 */
export default nmplayer;
