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
	PlayStateToken,
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
import type { IAudioBackend } from './adapters/audio-backend/IAudioBackend';
import type {
	AudioBackendKind,
	AudioTrackState,
	CrossfadeOptions,
	EQBand,
	EQSliderValues,
	EqualizerPreset,
	IMusicPlayer,
	MusicEventMap,
	MusicPlayerConfig,
	MusicPlaylistItem,
	PlayState,
	QualityState,
	RepeatState,
	ShuffleState,
	VolumeState,
} from './types';
import {
	composeMixins,
	CrossfadeTransitionStrategy,
	EventEmitter,
	initPlayerCoreState,
	MediaFormatError,
	NotImplementedError,
	playerCoreMethods,
	resolvePlayerConstructor,
} from '@nomercy-entertainment/nomercy-player-core';
import { AudioElementBackend } from './adapters/audio-backend/html5-audio';
import { WebAudioBackend } from './adapters/audio-backend/web-audio';
import { MusicPreloadStrategy } from './player/preload';
import { normalizeMusicConfig } from './player/v1-config-normalizer';

export { MusicPreloadStrategy } from './player/preload';

export type {
	AudioBackendKind,
	CrossfadeCurve,
	CrossfadeOptions,
	EQBand,
	EQSliderValues,
	EqualizerPreset,
	IMusicPlayer,
	Item,
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

const _instances = new Map<string, NMMusicPlayer<any>>();

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
	extends EventEmitter<MusicEventMap>
	implements IPlayer<MusicEventMap>, IMusicPlayer<T> {
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
	declare readonly __eventMap__: MusicEventMap;

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
	declare next: (opts?: ActionOptions) => Promise<void>;
	declare previous: (opts?: ActionOptions) => Promise<void>;
	declare rewind: (seconds?: number, opts?: ActionOptions) => Promise<void>;
	declare forward: (seconds?: number, opts?: ActionOptions) => Promise<void>;
	declare restart: (opts?: ActionOptions) => Promise<void>;

	declare time: {
		(): number;
		(t: number, opts?: ActionOptions): Promise<void>;
	};

	declare duration: () => number;
	declare buffered: () => number;
	declare bufferedRanges: () => TimeRanges;
	declare seekable: () => TimeRanges;
	declare timeData: () => KitTimeState;
	/** Seek to a position expressed as a percentage (0–100) of total duration. V1 parity. */
	declare seekByPercentage: (pct: number, opts?: ActionOptions) => void;

	declare playbackRate: {
		(): number;
		(rate: number): void;
	};

	declare playbackRates: () => number[];

	declare volume: {
		(): number;
		(v: number): void;
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
	declare queueSort: (compare: (a: T, b: T) => number, opts?: ActionOptions) => void;
	declare peekNext: () => T | undefined;
	declare peekPrevious: () => T | undefined;
	declare queueLength: () => number;
	declare queueIndexOf: (id: string | number) => number;

	declare item: {
		(): T | undefined;
		(target: T | string | number, opts?: ActionOptions): void;
	};

	declare index: () => number;
	declare seekToIndex: (position: number, opts?: ActionOptions) => void;

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
		// Resolve FIRST so the existing-instance path doesn't waste state init.
		// Spec §AB: avoid re-initializing core state on a player that's already
		// fully constructed and possibly mid-pipeline.
		const resolved = resolvePlayerConstructor(id, _instances, 'NMMusicPlayer');
		if (resolved.kind === 'existing') {
			return resolved.instance as unknown as this;
		}

		initPlayerCoreState(this, { className: 'NMMusicPlayer' });
		(this as { playerId: string }).playerId = resolved.id;
		this.container = resolved.div;
		_instances.set(resolved.id, this);
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
	backend(): IAudioBackend;
	backend(kind: AudioBackendKind): Promise<void>;
	backend(kind?: AudioBackendKind): IAudioBackend | Promise<void> {
		if (kind === undefined) {
			if (!this._backend) {
				const opts = this.options as MusicPlayerConfig<T> | undefined;
				const configKind = opts?.backend ?? 'audio-element';
				const factory = opts?.backendFactory;
				if (factory)
					this._backend = factory(configKind, opts as MusicPlayerConfig<BasePlaylistItem>);
				else if (configKind === 'webaudio')
					this._backend = new WebAudioBackend(this.container);
				else
					this._backend = new AudioElementBackend(this.container);
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
			const factory = opts?.backendFactory;
			if (factory)
				this._backend = factory(kind, opts as MusicPlayerConfig<BasePlaylistItem>);
			else if (kind === 'webaudio')
				this._backend = new WebAudioBackend(this.container);
			else
				this._backend = new AudioElementBackend(this.container);
			this._wireBackend(this._backend);
			this.emit('backend:changed', { kind });
		});
	}

	private _firstFrameEmitted = false;
	private _trackEndingSoonEmitted = false;

	private _wireBackend(instance: IAudioBackend): void {
		this._firstFrameEmitted = false;
		this._trackEndingSoonEmitted = false;

		/**
		 * Narrow view of the composed kit internals needed by this method only.
		 *  These fields are written onto the instance by playerCoreMethods via
		 *  composeMixins — they exist at runtime but are not declared on the class
		 *  (they live on the Internals interface in the kit). The cast is isolated
		 *  here; all mutations go through the declared helpers or direct assignment
		 *  on the typed surface.
		 */
		interface WireInternals {
			_phase: PlayerPhase;
			_playState: PlayStateToken;
			_transitionPhase: (next: PlayerPhase) => void;
		}
		const internals = this as unknown as WireInternals;

		instance.on('canplay', () => {
			if (this._firstFrameEmitted)
				return;
			this._firstFrameEmitted = true;

			if (internals._phase === 'starting') {
				internals._transitionPhase('playing');
			}

			this.emit('firstFrame', undefined);
		});

		instance.on('play', () => {
			if (internals._playState !== 'playing') {
				internals._playState = 'playing';
				this.emit('play', undefined);
			}

			// Phase: 'starting' → 'playing' when audio actually starts playing.
			// Needed for the "load → wait → play" pattern where canplay already
			// fired during load (setting _firstFrameEmitted = true) and won't
			// re-fire on element.play().
			if (internals._phase === 'starting') {
				internals._transitionPhase('playing');
			}
		});

		instance.on('playing', () => {
			this.emit('playing', undefined);
		});

		instance.on('pause', () => {
			if (internals._playState === 'playing') {
				internals._playState = 'paused';
				this.emit('pause', undefined);
			}
		});

		instance.on('ended', () => {
			if (internals._phase !== 'ended') {
				internals._transitionPhase('ended');
			}
			this.emit('ended', undefined);
		});

		const onResetToPaused = (): void => {
			this._firstFrameEmitted = false;
			this._trackEndingSoonEmitted = false;
			if (internals._playState === 'playing') {
				internals._playState = 'paused';
				this.emit('pause', undefined);
			}
		};
		instance.on('loadstart', onResetToPaused);

		instance.on('timeupdate', () => {
			const currentTime = instance.currentTime();
			const totalDuration = instance.duration();
			const safeD = Number.isFinite(totalDuration) && totalDuration > 0 ? totalDuration : 0;
			const percentage = safeD > 0 ? (currentTime / safeD) * 100 : 0;
			const remaining = safeD > 0 ? safeD - currentTime : 0;

			this.emit('time', { time: currentTime, percentage, position: currentTime, duration: safeD, remaining });

			if (!this._trackEndingSoonEmitted) {
				const duration = instance.duration();
				const threshold = this.options?.trackEndingSoonThreshold ?? 10;
				if (duration > 0 && currentTime >= duration - threshold) {
					this._trackEndingSoonEmitted = true;
					const currentTrack = this.item?.();
					if (currentTrack) {
						this.emit('trackEndingSoon', {
							remaining: duration - currentTime,
							currentTrack,
						});
					}
				}
			}
		});

		// Read duration from the backend. If the backend hasn't resolved a valid
		// duration yet (returns NaN / 0), fall back to the item's consumer-supplied
		// `duration` field so seekbars have a length before metadata arrives.
		instance.on('loadedmetadata', () => {
			const backendDuration = instance.duration();
			if (backendDuration > 0) {
				this.emit('duration', { duration: backendDuration });
				return;
			}
			const itemDuration = (this.item?.() as (MusicPlaylistItem & { duration?: number }) | undefined)?.duration;
			if (typeof itemDuration === 'number' && itemDuration > 0) {
				this.emit('duration', { duration: itemDuration });
			}
		});
	}

	// ── Loading ── composed in via `loadingMethods` mixin.
	declare load: (item: T, opts?: LoadOptions) => Promise<void>;
	declare loadQueue: (url: string, parser?: (raw: string) => T[]) => Promise<void>;

	// ── Crossfade — dual-element implementation ──
	//
	// Spec §M / spec §3 example. Two `<audio>` elements ramp gain in opposite
	// directions over `opts.duration` seconds (default 5). Primary fades to 0
	// while secondary ramps from 0 to the player's current volume. At
	// completion the backends swap: secondary becomes primary, old primary
	// unloads + disposes, secondary's slot is freed for the next preload.
	//
	// Short-circuits:
	//   - `_isTransitioning === true` → ignore (no nested crossfade).
	//   - duration <= 0 → instant swap, no ramp.
	//   - track resolves to no URL → throws MediaFormatError.
	async crossfadeTo(track: T, opts?: CrossfadeOptions & ActionOptions): Promise<void> {
		if (this._isTransitioning)
			return; // idempotent guard — reject stacked crossfades

		const durationMs = ((opts?.duration ?? this.options?.crossfadeDefaults?.duration ?? 5) * 1000);
		const url = (track as { url?: string }).url;
		if (!url) {
			throw new MediaFormatError({
				code: 'core:media/missing-url',
				severity: 'error',
				scope: { kind: 'core' },
				message: 'crossfadeTo(track) requires `track.url` to be present.',
				context: { id: (track as { id?: string | number }).id },
			});
		}

		const backend = this.backend();
		const fromTrack = this.item?.() ?? null;

		this._isTransitioning = true;
		this.emit('crossfadeStart', {
			from: fromTrack,
			to: track,
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

		// Advance the cursor so `item()` reflects the new track. The setter
		// overload emits the `current` event, which downstream plugins
		// (mediaSession, lyrics, autoAdvance) listen to.
		this.item?.(track.id ?? track);

		this._isTransitioning = false;
		this.emit('crossfadeComplete', { track });
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
	declare subtitles: () => SubtitleTrack[];
	declare subtitle: {
		(): CurrentSubtitleSelection | null;
		(idx: number | null): void;
	};

	declare audioTracks: () => AudioTrack[];
	declare audioTrack: {
		(): CurrentAudioTrackSelection | null;
		(idx: number): void;
	};

	declare qualityLevels: () => QualityLevel[];
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

{
	const composedDispose = NMMusicPlayer.prototype.dispose as () => void;
	NMMusicPlayer.prototype.dispose = function (this: NMMusicPlayer<MusicPlaylistItem>): void {
		const self = this as unknown as { _backend?: { dispose?: () => void } };
		try { self._backend?.dispose?.(); }
		catch { /* defensive — kit must still finish disposing */ }
		self._backend = undefined;
		_instances.delete(this.playerId);
		composedDispose.call(this);
	};
}

/**
 * @deprecated Use `nmMusicPlayer` instead. This factory name is the v1
 * migration alias. New code should call `nmMusicPlayer(id)`.
 *
 * When `setup({ expose: true })` is called on the returned instance,
 * `window.nmMPlayer` is set to this factory for console access alongside
 * `window.player` (wired by the kit). Cleaned up on `dispose()`.
 *
 * ```ts
 * const player = nmMusicPlayer<MyTrack>('player')
 *   .setup({ ... })
 *   .addPlugin(audioGraphPlugin)
 *   .addPlugin(equalizerPlugin);
 * ```
 */
export function nmMPlayer<T extends MusicPlaylistItem = MusicPlaylistItem>(id?: string | number): NMMusicPlayer<T> {
	const instance = new NMMusicPlayer<T>(id);

	const originalSetup = instance.setup.bind(instance);
	instance.setup = function (config: MusicPlayerConfig<T>): NMMusicPlayer<T> {
		// Normalise v1 legacy fields (accessToken → auth.bearerToken,
		// debug: true → logLevel: 'debug') at the library boundary so core
		// never sees them and carries no compat knowledge.
		const normalizedConfig = normalizeMusicConfig(config);

		// Apply music-domain strategy defaults before delegating to the kit pipeline.
		// Consumer-supplied strategies always win — only inject when absent.
		const leadSeconds = normalizedConfig.preloadLeadSeconds ?? 10;
		const crossfadeLeadSeconds = normalizedConfig.crossfadeLeadSeconds ?? 3;
		const crossfadeTailSeconds = normalizedConfig.crossfadeTailSeconds ?? 3;

		const enrichedConfig: MusicPlayerConfig<T> = {
			crossfadeEnabled: true,
			...normalizedConfig,
			preloadLeadSeconds: leadSeconds,
			crossfadeLeadSeconds,
			crossfadeTailSeconds,
			preloadStrategy: normalizedConfig.preloadStrategy ?? new MusicPreloadStrategy(leadSeconds),
			transitionStrategy: normalizedConfig.transitionStrategy ?? new CrossfadeTransitionStrategy({
				leadSeconds: crossfadeLeadSeconds,
				tailSeconds: crossfadeTailSeconds,
				curve: normalizedConfig.crossfadeDefaults?.curve ?? 'equal-power',
			}),
		};

		const result = originalSetup(enrichedConfig);

		if (config.expose === true && typeof window !== 'undefined') {
			Object.assign(window, { nmMPlayer });
			const originalDispose = instance.dispose.bind(instance);
			instance.dispose = function (): void {
				if (Object.is(Reflect.get(window, 'nmMPlayer'), nmMPlayer)) {
					Reflect.deleteProperty(window, 'nmMPlayer');
				}
				originalDispose();
			};
		}
		return result;
	};

	return instance;
}

/**
 * Canonical v2 entry point. Use this name in all new code.
 *
 * ```ts
 * import { nmMusicPlayer } from '@nomercy-entertainment/nomercy-music-player';
 * const player = nmMusicPlayer('my-div');
 * ```
 *
 * `nmMPlayer` is the deprecated v1-compat alias; it exists only for migration.
 */
export const nmMusicPlayer = nmMPlayer;

// ─────────────────────────────────────────────────────────────────────────────
// v1 compatibility — PlayerCore
//
// The app imports `PlayerCore` as both a value (constructor) and a type:
//
//   import { PlayerCore as MusicPlayer } from '@nomercy-entertainment/nomercy-music-player'
//   export const audioPlayer = new MusicPlayer<PlaylistItem>({ ... })
//   import type PlayerCore from '@nomercy-entertainment/nomercy-music-player'
//   player: PlayerCore<PlaylistItem>
//
// Design decision (Spine, 2026-06-10):
//   `PlayerCore<T>` uses the TypeScript interface + class merge pattern.
//   The INTERFACE declares the full v1 API surface (all NMMusicPlayer<T> methods
//   via `extends NMMusicPlayer<T>` PLUS v1 compat aliases and equalizer stubs).
//   The CLASS constructor returns a real NMMusicPlayer<T> instance (constructor
//   return override) with v1 method aliases attached at runtime.
//
//   TypeScript merges the interface and class declarations — so
//   `player: PlayerCore<T>` gives the full typed surface, and
//   `new PlayerCore(opts)` returns an instance satisfying that surface.
//
// @deprecated Use `NMMusicPlayer` directly in new code.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * v1 PlayerOptions shape — accepted by `PlayerCore` constructor.
 * @deprecated Use `MusicPlayerConfig` in new code.
 */
export interface V1MusicPlayerOptions {
	/** @deprecated Not used in v2 — visualization is a consumer concern. */
	motionConfig?: Record<string, unknown>;
	/** @deprecated Not used in v2 — visualization is a consumer concern. */
	motionColors?: string[];
	/**
	 * @deprecated Set `document.title` directly or use MediaSessionPlugin.
	 * Accepted silently and ignored in v2.
	 */
	siteTitle?: string;
	/**
	 * When true, exposes `window.musicPlayer` for console debugging.
	 * Mapped to `MusicPlayerConfig.expose`.
	 */
	expose?: boolean;
	/**
	 * When true, the player will not auto-advance to the next track.
	 * Mapped to `MusicPlayerConfig.disableAutoAdvance`.
	 */
	disableAutoPlayback?: boolean;
	/** @deprecated Not used in v2 core. Wire MediaSession actions via MediaSessionPlugin. */
	actions?: {
		play?: () => void;
		pause?: () => void;
		stop?: () => void;
		previous?: () => void;
		next?: () => void;
		seek?: (position: number) => void;
	};
	/** @deprecated Use `MusicPlayerConfig.crossfadeDefaults`. */
	onCrossfadeStart?: () => void;
	/** @deprecated Use `MusicPlayerConfig.crossfadeDefaults`. */
	onCrossfadeComplete?: () => void;
	/** @deprecated Use `MusicPlayerConfig.baseUrl`. */
	baseUrl?: string;
}

// ── v1 equalizer default data ─────────────────────────────────────────────────

const _eqSliderValues: EQSliderValues = {
	pan:  { min: -1, max: 1,   step: 0.01, default: 0 },
	pre:  { min: -1, max: 3,   step: 1,    default: 0 },
	band: { min: -12, max: 12, step: 0.01, default: 0 },
};

const _eqBandsDefault: EQBand[] = [
	{ frequency: 'Pre', gain: 0 },
	{ frequency: 70,    gain: 0 },
	{ frequency: 180,   gain: 0 },
	{ frequency: 320,   gain: 0 },
	{ frequency: 600,   gain: 0 },
	{ frequency: 1000,  gain: 0 },
	{ frequency: 3000,  gain: 0 },
	{ frequency: 6000,  gain: 0 },
	{ frequency: 12000, gain: 0 },
	{ frequency: 14000, gain: 0 },
	{ frequency: 16000, gain: 0 },
];

const _eqPresetsDefault: EqualizerPreset[] = [
	{ name: 'Flat',   values: [70, 180, 320, 600, 1000, 3000, 6000, 12000, 14000, 16000].map(f => ({ frequency: f, gain: 0 })) },
	{ name: 'Custom', values: [70, 180, 320, 600, 1000, 3000, 6000, 12000, 14000, 16000].map(f => ({ frequency: f, gain: 0 })) },
];

/**
 * Attach v1 method aliases and equalizer stubs to a bare `NMMusicPlayer`
 * instance so that consumer code calling v1-era methods continues to work
 * after the migration.
 *
 * Called once in the `PlayerCore` constructor before returning the instance.
 */
function _attachV1Compat<T extends MusicPlaylistItem>(
	player: NMMusicPlayer<T>,
	config: V1MusicPlayerOptions,
): void {
	const raw = player as unknown as Record<string, unknown>;

	// ── Transport aliases ──

	raw['seek'] = (position: number) => void player.time(position);

	raw['setVolume'] = (value: number) => { player.volume(value); };

	raw['repeat'] = (state: string) => {
		player.repeatState(state as RepeatState);
	};

	raw['shuffle'] = (enabled: boolean | ShuffleState) => {
		player.shuffleState(enabled);
	};

	raw['toggleMute'] = () => { player.toggleMute(); };

	raw['setAutoPlayback'] = (_enabled: boolean) => {
		// v2 auto-advance is config-level — silently accepted at runtime.
	};

	// ── Queue aliases ──

	Object.defineProperty(player, 'currentSong', {
		get: () => player.item(),
		configurable: true,
	});

	raw['getQueue'] = () => player.queue();

	raw['setCurrentSong'] = (item: T) => { player.item(item); };

	raw['removeFromQueue'] = (item: T) => { player.queueRemove(item.id); };

	raw['addToBackLog'] = (item: T | undefined) => {
		if (item) {
			player.backlogAppend(item);
		}
	};

	raw['playTrack'] = (item: T, queue?: T[]) => {
		if (queue?.length) {
			player.queue(queue);
		}
		player.item(item);
		void player.play();
	};

	// ── Equalizer stubs (no equalizer plugin in v2 core) ──
	// These provide the data/methods the app's initEqualizer() reads at startup.
	// Full equalizer functionality requires the v2 EqualizerPlugin (future).

	raw['equalizerPanning'] = 0;
	raw['equalizerBands'] = [..._eqBandsDefault];
	raw['equalizerPresets'] = [..._eqPresetsDefault];
	raw['equalizerSliderValues'] = _eqSliderValues;

	raw['setPanner'] = (_value: number) => {
		raw['equalizerPanning'] = _value;
	};

	raw['setPreGain'] = (value: number) => {
		const bands = raw['equalizerBands'] as EQBand[];
		const pre = bands.find(band => band.frequency === 'Pre');
		if (pre) {
			pre.gain = value;
		}
	};

	raw['setFilter'] = (band: EQBand) => {
		const bands = raw['equalizerBands'] as EQBand[];
		const target = bands.find(existing => existing.frequency === band.frequency);
		if (target) {
			target.gain = band.gain;
		}
	};

	raw['saveEqualizerSettings'] = () => {
		// Stub — no persistence in v2 core. EqualizerPlugin will handle this.
	};

	// Wire any v1 action callbacks from the config. These fire in addition to
	// the normal v2 player lifecycle so both the v1 actions object AND v2 event
	// listeners work simultaneously.
	if (config.actions) {
		const { play: onPlay, pause: onPause, stop: onStop, previous: onPrevious, next: onNext, seek: onSeek } = config.actions;
		if (onPlay)     { player.on('play'  as never, onPlay     as never); }
		if (onPause)    { player.on('pause' as never, onPause    as never); }
		if (onStop)     { player.on('stop'  as never, onStop     as never); }
		if (onPrevious) { player.on('previous' as never, onPrevious as never); }
		if (onNext)     { player.on('next'  as never, onNext     as never); }
		if (onSeek)     { player.on('time'  as never, (state: { position: number }) => onSeek(state.position) as never); }
	}
}

/**
 * @deprecated Use `NMMusicPlayer` directly.
 *
 * Instance interface for `PlayerCore<T>`. Merges with the class declaration
 * below so TypeScript sees all `NMMusicPlayer<T>` methods + v1 compat aliases
 * as the resolved type for `new PlayerCore(opts)`.
 *
 * This is the canonical interface for the default export so that:
 *   `import type PlayerCore from '@nomercy-entertainment/nomercy-music-player'`
 * gives a type where `player: PlayerCore<T>` resolves correctly.
 */
export interface PlayerCore<T extends MusicPlaylistItem = MusicPlaylistItem> extends NMMusicPlayer<T> {
	// ── v1 transport aliases ──
	/** @deprecated Use `player.time(position)` in v2. */
	seek(position: number): void;
	/** @deprecated Use `player.volume(v)` in v2. */
	setVolume(value: number): void;
	/** @deprecated Use `player.repeatState(state)` in v2. */
	repeat(state: string): void;
	/** @deprecated Use `player.shuffleState(enabled)` in v2. */
	shuffle(enabled: boolean): void;
	/** @deprecated Use `player.toggleMute()` in v2. */
	toggleMute(): void;
	/** @deprecated Accepted silently; auto-advance is config-level in v2. */
	setAutoPlayback(enabled: boolean): void;

	// ── v1 queue aliases ──
	/** @deprecated Use `player.item()` in v2. */
	readonly currentSong: T | undefined;
	/** @deprecated Use `player.queue()` in v2. */
	getQueue(): T[];
	/** @deprecated Use `player.item(item)` in v2. */
	setCurrentSong(item: T): void;
	/** @deprecated Use `player.queueRemove(item.id)` in v2. */
	removeFromQueue(item: T): void;
	/** @deprecated Use `player.backlogAppend(item)` in v2. */
	addToBackLog(item: T | undefined): void;
	/** @deprecated Use `player.queue(q)` + `player.item(item)` + `player.play()` in v2. */
	playTrack(item: T, queue?: T[]): void;

	// ── v1 auth / config setters ──
	/** @deprecated Use `player.auth({ bearerToken: token })` in v2. */
	setAccessToken(token: string | (() => string) | undefined): void;
	/** @deprecated Use `player.baseUrl(url)` in v2. */
	setBaseUrl(url: string | undefined): void;
	/** Convenience getter — truthy when an auth token is configured. @deprecated Check via `player.auth()` in v2. */
	readonly accessToken: string | undefined;

	// ── v1 queue aliases (additional) ──
	/** @deprecated Use `player.queue(items)` in v2. */
	setQueue(items: T[]): void;
	/** @deprecated Use `player.queueAppend(item)` in v2. */
	addToQueue(item: T): void;
	/**
	 * @deprecated Use `player.crossfadeTo(item)` in v2.
	 * Pre-load an item into the secondary audio buffer for gapless crossfade.
	 */
	prepareCrossfade(item?: T): void;

	// ── v1 internal audio element access ──
	/**
	 * @deprecated Direct audio-element access. Used for visualization engine attachment.
	 * Shape is `unknown` — the actual value is the audio backend's element wrapper
	 * (includes `.motion` for audiomotion-analyzer). Do not depend on this in new code.
	 */
	_audioElement1: unknown;
	/** @deprecated Direct audio-element access — secondary crossfade buffer. @see _audioElement1 */
	_audioElement2: unknown;

	// ── v1 event on() overloads ───────────────────────────────────────────────
	// v2 events fire objects; v1 consumer code reads the payload as a primitive.
	// The v1-compat plugin reshapes these at runtime; these overloads give
	// consumer TypeScript the correct types.

	/** v1 time event — payload includes position, duration, remaining, percentage. */
	on(event: 'time', fn: (data: { time: number; position: number; duration: number; remaining: number; percentage: number }) => void): void;
	/** v1 song / current-item event — payload is the current track item or null. */
	on(event: 'song', fn: (item: T | null) => void): void;
	/** v1 queue event — payload is the current queue array. */
	on(event: 'queue', fn: (data: T[]) => void): void;
	/** v1 backlog event — payload is the current backlog array. */
	on(event: 'backlog', fn: (data: T[]) => void): void;
	/** v1 play event — no payload. */
	on(event: 'play', fn: () => void): void;
	/** v1 pause event — no payload. */
	on(event: 'pause', fn: () => void): void;
	/** v1 stop event — no payload. */
	on(event: 'stop', fn: () => void): void;
	/** v1 seeked event — payload includes position. */
	on(event: 'seeked', fn: (data: { position: number; time: number }) => void): void;
	/** v1 mute event — payload is the boolean directly (v2 wraps in `{ muted }`). */
	on(event: 'mute', fn: (muted: boolean) => void): void;
	/** v1 shuffle event — payload is the boolean directly (v2 wraps in `{ state }`). */
	on(event: 'shuffle', fn: (enabled: boolean) => void): void;
	/** v1 repeat event — payload is the RepeatState string directly (v2 wraps in `{ state }`). */
	on(event: 'repeat', fn: (state: RepeatState) => void): void;
	/** v1 volume event — payload is the number directly (v2 wraps in `{ level }`). */
	on(event: 'volume', fn: (level: number) => void): void;

	// ── v1 equalizer stubs ──
	/** @deprecated Not implemented in v2 core. Use EqualizerPlugin. */
	equalizerPanning: number;
	/** @deprecated Not implemented in v2 core. Use EqualizerPlugin. */
	equalizerBands: EQBand[];
	/** @deprecated Not implemented in v2 core. Use EqualizerPlugin. */
	equalizerPresets: EqualizerPreset[];
	/** @deprecated Not implemented in v2 core. Use EqualizerPlugin. */
	equalizerSliderValues: EQSliderValues;
	/** @deprecated Not implemented in v2 core. Use EqualizerPlugin. */
	setPanner(value: number): void;
	/** @deprecated Not implemented in v2 core. Use EqualizerPlugin. */
	setPreGain(value: number): void;
	/** @deprecated Not implemented in v2 core. Use EqualizerPlugin. */
	setFilter(band: EQBand): void;
	/** @deprecated Not implemented in v2 core. Use EqualizerPlugin. */
	saveEqualizerSettings(): void;
}

/**
 * @deprecated Use `NMMusicPlayer` directly.
 *
 * `PlayerCore<T>` is a constructable v1 compatibility wrapper around
 * `NMMusicPlayer<T>`. It accepts the v1 config shape and returns an
 * `NMMusicPlayer<T>` instance extended with v1 method aliases.
 *
 * The TypeScript interface above merges with this class declaration so the
 * resolved instance type includes every `NMMusicPlayer<T>` method and every
 * v1 compat alias — no casts required at call sites.
 */
export class PlayerCore<T extends MusicPlaylistItem = MusicPlaylistItem> {
	constructor(config: V1MusicPlayerOptions) {
		// Map v1 config to v2 config shape.
		const v2Config: MusicPlayerConfig<T> & { expose?: boolean } = {
			expose: config.expose,
		};

		if (config.baseUrl) {
			v2Config.baseUrl = config.baseUrl;
		}

		// v2 requires a DOM element; v1 PlayerCore was headless. Mount on a
		// detached invisible div so the player instance can be created without
		// any visible container. The music player never touches the DOM for
		// rendering — the div is only needed to satisfy the registry contract.
		const containerId = `_nm_playercore_${Date.now()}_${Math.random().toString(36).slice(2)}`;
		let mountDiv: HTMLDivElement | null = null;
		if (typeof document !== 'undefined') {
			mountDiv = document.createElement('div');
			mountDiv.id = containerId;
			mountDiv.style.display = 'none';
			document.body.appendChild(mountDiv);
		}

		const player = nmMPlayer<T>(mountDiv ? containerId : undefined);
		player.setup(v2Config as MusicPlayerConfig<T>);

		// Remove the invisible mount div once the player is set up — it served
		// its only purpose (satisfying the registry constructor requirement).
		if (mountDiv) {
			mountDiv.remove();
		}

		// Attach v1 method aliases + equalizer stubs to the NMMusicPlayer instance.
		_attachV1Compat(player, config);

		// Expose window.musicPlayer when expose: true, mirroring v1 behaviour.
		if (config.expose && typeof window !== 'undefined') {
			(window as unknown as Record<string, unknown>)['musicPlayer'] = player;
		}

		// Return the underlying NMMusicPlayer instance (with v1 aliases attached).
		// TypeScript sees PlayerCore<T> as the merged interface type, so all methods
		// are visible. At runtime, the instance IS an NMMusicPlayer<T>.
		return player as unknown as PlayerCore<T>;
	}
}

/**
 * Default export is `PlayerCore` so that:
 *   `import type PlayerCore from '@nomercy-entertainment/nomercy-music-player'`
 * resolves to the v1 compat wrapper type (which extends `NMMusicPlayer<T>`).
 *
 * New code should use `nmMPlayer` or `nmMusicPlayer` named exports instead.
 */
export default PlayerCore;
