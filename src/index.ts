import {
	AudioGraphPlugin,
	BufferState,
	composeMixins,
	EqualizerPlugin,
	EventEmitter,
	initPlayerCoreState,
	MediaFormatError,
	NetworkState,
	NotImplementedError,
	playerCoreMethods,
	resolvePlayerConstructor,
	VisibilityState,
} from '@nomercy-entertainment/nomercy-player-core';

export { NotImplementedError } from '@nomercy-entertainment/nomercy-player-core';
import type {
	ActionOptions,
	AudioTrack,
	AuthConfig,
	BasePlaylistItem,
	CanPlayResult,
	CastState,
	Chapter,
	CueParser,
	CurrentAudioTrackSelection,
	CurrentQualitySelection,
	CurrentSubtitleSelection,
	DeviceCapabilities,
	IPlayer,
	TimeState as KitTimeState,
	LoadOptions,
	PlaybackMetrics,
	PlayerExperimental,
	PlayerPhase,
	PlayStateToken,
	Plugin,
	PluginCtorWithId,
	QualityLevel,
	ResolvedUrl,
	SetupState,
	StreamFactory,
	SubtitleTrack,
	Translations,
	UrlCategory,
	UrlResolver,
} from '@nomercy-entertainment/nomercy-player-core';
import type { PreloadStrategy, TransitionStrategy } from '@nomercy-entertainment/nomercy-player-core';
import type { IAudioBackend } from './adapters/audio-backend/IAudioBackend';
import { AudioElementBackend } from './adapters/audio-backend/html5-audio';
import { WebAudioBackend } from './adapters/audio-backend/web-audio';
import { MusicPreloadStrategy } from './player/preload';
import { CrossfadeTransitionStrategy } from '@nomercy-entertainment/nomercy-player-core';
import type {
	AudioBackendKind,
	CrossfadeOptions,
	IMusicPlayer,
	MusicEventMap,
	MusicPlayerConfig,
	MusicPlaylistItem,
	PlayState,
	RepeatState,
	ShuffleState,
	VolumeState,
} from './types';
import {
	AudioTrackState,
	QualityState,
} from './types';
import {
	AutoAdvancePlugin,
	CastSenderPlugin,
	KeyHandlerPlugin,
	LyricsPlugin,
	MediaSessionPlugin,
	TabLeaderPlugin,
} from './plugins';

export type {
	AudioBackendKind,
	CrossfadeOptions,
	IMusicPlayer,
	MusicEventMap,
	MusicPlayerConfig,
	MusicPlaylistItem,
	TimeState,
} from './types';
export { MusicPreloadStrategy } from './player/preload';
export {
	AudioTrackState,
	PlayState,
	QualityState,
	RepeatState,
	ShuffleState,
	VolumeState,
} from './types';

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
export class NMMusicPlayer<T extends BasePlaylistItem = MusicPlaylistItem>
	extends EventEmitter<MusicEventMap>
	implements IPlayer<MusicEventMap>, IMusicPlayer<T> {
	readonly playerId: string = '';
	container: HTMLElement = <HTMLElement>{};

	get id(): string {
		return this.playerId;
	}

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

	declare registerCueParser: (parser: CueParser, prepend?: boolean) => void;
	declare unregisterCueParser: (id: string) => void;
	declare resolveCueParser: (url: string) => CueParser | undefined;

	declare play: (opts?: ActionOptions) => Promise<void>;
	declare pause: (opts?: ActionOptions) => Promise<void>;
	declare stop: (opts?: ActionOptions) => Promise<void>;
	declare togglePlayback: (opts?: ActionOptions) => Promise<void>;
	declare next: (opts?: ActionOptions) => Promise<void>;
	declare previous: (opts?: ActionOptions) => Promise<void>;
	declare rewind: (seconds?: number, opts?: ActionOptions) => Promise<void>;
	declare forward: (seconds?: number, opts?: ActionOptions) => Promise<void>;
	declare restart: (opts?: ActionOptions) => Promise<void>;

	declare currentTime: {
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

	declare current: {
		(): T | undefined;
		(target: T | string | number, opts?: ActionOptions): void;
	};
	declare currentIndex: () => number;
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
	declare registerStream: (factory: StreamFactory, prepend?: boolean) => this;
	declare unregisterStream: (id: string) => this;
	declare streams: () => ReadonlyArray<string>;
	declare getStreamFactory: (id: string) => StreamFactory | undefined;

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
				this._backend = factory
					? factory(configKind, opts as MusicPlayerConfig<BasePlaylistItem>)
					: configKind === 'webaudio'
						? new WebAudioBackend(this.container)
						: new AudioElementBackend(this.container);
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
			this._backend = factory
				? factory(kind, opts as MusicPlayerConfig<BasePlaylistItem>)
				: kind === 'webaudio'
					? new WebAudioBackend(this.container)
					: new AudioElementBackend(this.container);
			this._wireBackend(this._backend);
			this.emit('backend:changed', { kind });
		});
	}

	private _firstFrameEmitted = false;
	private _trackEndingSoonEmitted = false;

	private _wireBackend(instance: IAudioBackend): void {
		this._firstFrameEmitted = false;
		this._trackEndingSoonEmitted = false;

		/** Narrow view of the composed kit internals needed by this method only.
		 *  These fields are written onto the instance by playerCoreMethods via
		 *  composeMixins — they exist at runtime but are not declared on the class
		 *  (they live on the Internals interface in the kit). The cast is isolated
		 *  here; all mutations go through the declared helpers or direct assignment
		 *  on the typed surface. */
		interface WireInternals {
			_phase: PlayerPhase;
			_playState: PlayStateToken;
			_transitionPhase: (next: PlayerPhase) => void;
		}
		const internals = this as unknown as WireInternals;

		instance.on('canplay', () => {
			if (this._firstFrameEmitted) return;
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
			this.emit('time', { time: currentTime });

			if (!this._trackEndingSoonEmitted) {
				const duration = instance.duration();
				const threshold = this.options?.trackEndingSoonThreshold ?? 10;
				if (duration > 0 && currentTime >= duration - threshold) {
					this._trackEndingSoonEmitted = true;
					const currentTrack = this.current?.();
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
			const itemDuration = (this.current?.() as (MusicPlaylistItem & { duration?: number }) | undefined)?.duration;
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
		const fromTrack = this.current?.() ?? null;

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

		// Advance the cursor so `current()` reflects the new track. The setter
		// overload emits the `current` event, which downstream plugins
		// (mediaSession, lyrics, autoAdvance) listen to.
		this.current?.(track.id ?? track);

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
	declare qualityState: {
		(): QualityState;
		(target: number | 'auto'): void;
	};
	declare audioTrackState: {
		(): AudioTrackState;
		(idx: number): void;
	};

	// ── Device capabilities ── composed in via `deviceMethods` mixin.
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
	declare currentAudioOutput: {
		(): Promise<string | null>;
		(deviceId: string): Promise<void>;
	};

	// ── Tracks / chapters / quality ── composed in via `mediaTracksMethods` mixin.
	declare subtitles: () => SubtitleTrack[];
	declare currentSubtitle: {
		(): CurrentSubtitleSelection | null;
		(idx: number | null): void;
	};
	declare audioTracks: () => AudioTrack[];
	declare currentAudioTrack: {
		(): CurrentAudioTrackSelection | null;
		(idx: number): void;
	};
	declare qualityLevels: () => QualityLevel[];
	declare currentQuality: {
		(): CurrentQualitySelection | 'auto';
		(idx: number | 'auto'): void;
	};
	declare chapters: () => Chapter[];
	declare currentChapter: {
		(): Chapter | null;
		(idx: number): void;
	};
	declare seekToChapter: (idx: number, opts?: ActionOptions) => void;
	declare nextChapter: (opts?: ActionOptions) => void;
	declare previousChapter: (opts?: ActionOptions) => void;

	// ── Cast / handoff ── composed in via `castMethods` mixin.
	declare castState: () => CastState;
	declare transferTo: (target: 'cast' | 'airplay' | 'remote-playback') => Promise<void>;

	// ── Auth runtime mutation ── composed in via `authMethods` mixin.
	declare auth: {
		(): Readonly<AuthConfig> | undefined;
		(config: AuthConfig): void;
		(partial: Partial<AuthConfig>): void;
	};
	declare refreshAuth: () => Promise<void>;
	declare resolveUrl: (url: string, category?: UrlCategory) => Promise<ResolvedUrl>;
	declare urlResolver: {
		(): UrlResolver | undefined;
		(resolver: UrlResolver | undefined): void;
	};

	// ── Performance metrics / clock / accessibility ── composed in via `metricsMethods` mixin.
	declare metrics: () => PlaybackMetrics;
	declare recordMetric: (name: string, value: number) => void;
	declare now: () => number;
	declare announce: (text: string, level?: 'polite' | 'assertive') => void;

	// ── Preload + transition strategies ── composed via `preloadStrategyMethods` mixin.
	declare setPreloadStrategy: (strategy: PreloadStrategy) => void;
	declare setTransitionStrategy: (strategy: TransitionStrategy) => void;
	declare preloadStrategy: () => PreloadStrategy;
	declare transitionStrategy: () => TransitionStrategy;

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
	NMMusicPlayer.prototype.dispose = function (this: NMMusicPlayer<BasePlaylistItem>): void {
		const self = this as unknown as { _backend?: { dispose?: () => void } };
		try { self._backend?.dispose?.(); }
		catch { /* defensive — kit must still finish disposing */ }
		self._backend = undefined;
		_instances.delete(this.playerId);
		composedDispose.call(this);
	};
}

/**
 * Factory entry point.
 *
 * When `setup({ expose: true })` is called on the returned instance,
 * `window.nmMPlayer` is set to this factory for console access alongside
 * `window.player` (wired by the kit). Cleaned up on `dispose()`.
 *
 * ```ts
 * const player = nmMPlayer<MyTrack>('player')
 *   .setup({ ... })
 *   .addPlugin(audioGraphPlugin)
 *   .addPlugin(equalizerPlugin);
 * ```
 */
export function nmMPlayer<T extends BasePlaylistItem = MusicPlaylistItem>(id?: string | number): NMMusicPlayer<T> {
	const instance = new NMMusicPlayer<T>(id);

	const originalSetup = instance.setup.bind(instance);
	instance.setup = function (config: MusicPlayerConfig<T>): NMMusicPlayer<T> {
		// Apply music-domain strategy defaults before delegating to the kit pipeline.
		// Consumer-supplied strategies always win — only inject when absent.
		const leadSeconds = config.preloadLeadSeconds ?? 10;
		const crossfadeLeadSeconds = config.crossfadeLeadSeconds ?? 3;
		const crossfadeTailSeconds = config.crossfadeTailSeconds ?? 3;

		const enrichedConfig: MusicPlayerConfig<T> = {
			crossfadeEnabled: true,
			...config,
			preloadLeadSeconds: leadSeconds,
			crossfadeLeadSeconds,
			crossfadeTailSeconds,
			preloadStrategy: config.preloadStrategy ?? new MusicPreloadStrategy(leadSeconds),
			transitionStrategy: config.transitionStrategy ?? new CrossfadeTransitionStrategy({
				leadSeconds: crossfadeLeadSeconds,
				tailSeconds: crossfadeTailSeconds,
				curve: config.crossfadeDefaults?.curve ?? 'equal-power',
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

export default nmMPlayer;

// interface MyTrack extends MusicPlaylistItem {
// 	readonly: string;
// }
//
// const player = nmMPlayer<MyTrack>('player')
// 	.setup({
// 		accessToken: () => {
// 			return 'token';
// 		},
// 	})
// 	.addPlugin(CastSenderPlugin)
// 	.addPlugin(KeyHandlerPlugin)
// 	.addPlugin(LyricsPlugin)
// 	.addPlugin(MediaSessionPlugin)
// 	.addPlugin(AutoAdvancePlugin)
// 	.addPlugin(AudioGraphPlugin)
// 	.addPlugin(EqualizerPlugin, {
//
// 	})
// 	.addPlugin(TabLeaderPlugin, {
// 		getLockKey: () => ``,
// 		handoffOnVisible: true,
// 		onLost: 'pause',
// 	});
//
// player.on('all', (event) => {
// 	console.log(`Event: ${event.type}`, event);
// });
