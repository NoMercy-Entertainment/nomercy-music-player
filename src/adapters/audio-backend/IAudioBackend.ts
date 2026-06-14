// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

export const AUDIO_BACKEND_KIND = {
	AUDIO_ELEMENT: 'audio-element',
	WEBAUDIO: 'webaudio',
} as const;

/** Backend selection — which audio engine handles playback. */
export type AudioBackendKind = typeof AUDIO_BACKEND_KIND[keyof typeof AUDIO_BACKEND_KIND];

/** Backend-internal events forwarded to the player's eventTarget. */
export type BackendEvent
	= | 'loadstart'
		| 'loadedmetadata'
		| 'canplay'
		| 'play'
	/**
	 * Fires when media is actually rendering — after buffering resolves, not
	 * just on element.play(). Use this to hide buffering spinners.
	 */
		| 'playing'
		| 'pause'
		| 'ended'
		| 'timeupdate'
		| 'waiting'
		| 'stalled'
		| 'ratechange'
		| 'encrypted'
		| 'error'
		| 'backend:loading'
		| 'backend:loaded'
	/**
	 * Fired by backends that own a Web Audio graph when the active source node
	 * changes — e.g. after a crossfade promotes the secondary element to primary.
	 * Plugins that hold a reference to the source node (e.g. `AudioGraphPlugin`)
	 * must re-mount after this event.
	 */
		| 'backend:sourceswap';

/**
 * Typed payload map for backend events. All DOM-bridge events carry the
 *  original `Event` object; internal lifecycle events carry metadata.
 */
export interface BackendEventPayload {
	'loadstart': Event;
	'loadedmetadata': Event;
	'canplay': Event;
	'play': Event;
	'playing': Event;
	'pause': Event;
	'ended': Event;
	'timeupdate': Event;
	'waiting': Event;
	'stalled': Event;
	'ratechange': Event;
	'encrypted': Event;
	'error': Event;
	'backend:loading': { url: string; kind: AudioBackendKind };
	'backend:loaded': { url: string; kind: AudioBackendKind; duration: number };
	/**
	 * Emitted after a crossfade swap — the active source node changed.
	 * `sourceNode` is the new volume GainNode (chain entry point).
	 * `analysisNode` is the new pre-volume raw source node when the backend
	 * exposes one; omitted by backends that don't maintain a separate analysis tap.
	 */
	'backend:sourceswap': { sourceNode: AudioNode; analysisNode?: AudioNode };
}

export const BACKEND_STATE = {
	IDLE: 'idle',
	LOADING: 'loading',
	READY: 'ready',
	PLAYING: 'playing',
	PAUSED: 'paused',
	ERROR: 'error',
} as const;

/** Backend lifecycle state. Returned by `state()`. */
export type BackendState = typeof BACKEND_STATE[keyof typeof BACKEND_STATE];

export const BACKEND_LOADER_STATE = {
	RUNNING: 'running',
	PAUSED: 'paused',
} as const;

/** Backend loader state — used for backpressure when an upstream encoder is gating output. */
export type BackendLoaderState = typeof BACKEND_LOADER_STATE[keyof typeof BACKEND_LOADER_STATE];

/**
 * Concrete contract every audio backend implements. The Player calls these; plugins
 * tap into `outputNode` / `analyserSource` to build effect chains.
 *
 * Two built-in implementations:
 *   - `AudioElementBackend` (html5-audio) — `<audio>` + lazy MediaElementSource
 *   - `WebAudioBackend` (web-audio) — `<audio>` + `MediaElementAudioSourceNode` routed through an `AudioContext` gain/analyser graph
 *
 * Method conventions:
 *   - **Stateful = overloaded function:** `volume()` / `volume(v)`
 *   - **Action = verb:** `play()`, `pause()`, `stop()`, `mute()`, `unmute()`
 *   - **Time / position uses `currentTime(t)` for seeking** — no separate `seek`
 */
export interface IAudioBackend {
	readonly kind: AudioBackendKind;

	// Lifecycle
	load(url: string, opts?: { preload: 'auto' | 'metadata' | 'none' }): Promise<void>;
	unload(): void;
	dispose(): void;

	/**
	 * Wire the provider whose return value goes into the `Authorization`
	 * header of network requests the backend issues itself (hls.js
	 * manifests/segments). Optional — backends without their own network
	 * stack omit it.
	 */
	setAuthHeaderProvider?(provider: () => string | undefined | Promise<string | undefined>): void;

	// Transport
	play(): Promise<void>;
	pause(): void;
	stop(): void;

	// Time / position
	currentTime(): number;
	currentTime(t: number): void;
	duration(): number;
	buffered(): number;
	bufferedRanges(): TimeRanges;
	seekable(): TimeRanges;
	playbackRate(): number;
	playbackRate(rate: number): void;

	// Volume
	volume(): number;
	volume(v: number): void;
	mute(): void;
	unmute(): void;

	// State
	state(): BackendState;

	// Effect-chain mount points — audio-graph plugins tap these
	outputNode(ctx: AudioContext): AudioNode;
	analyserSource(ctx: AudioContext): AudioNode;

	/**
	 * Returns the raw audio source node BEFORE the volume GainNode.
	 *
	 * AudioGraphPlugin uses this to tap the AnalyserNode upstream of the volume
	 * control, so spectrum/FFT magnitudes are volume-independent. Optional —
	 * backends that do not maintain an explicit pre-volume source node omit this;
	 * AudioGraphPlugin falls back to `outputNode` when it is absent.
	 *
	 * The returned node must be in the same `AudioContext` as `outputNode`.
	 */
	analysisNode?(ctx: AudioContext): AudioNode;

	/**
	 * Returns the `AudioContext` this backend owns, if any. Optional — only
	 * `WebAudioBackend` implements this. The player calls this immediately after
	 * backend construction to register the context via `setPlayerAudioContext`
	 * so the shared kit context and the backend context are always the same
	 * object. Backends without an `AudioContext` (e.g. `AudioElementBackend`)
	 * omit this method.
	 */
	audioContext?(): AudioContext;

	// Raw element access — cast SDKs and other low-level integrations bind here
	mediaElement(): HTMLMediaElement;

	// MediaStream capture — clip / record plugins consume this
	captureStream(): MediaStream;

	// Audio output device routing
	setSinkId(deviceId: string): Promise<void>;
	getSinkId(): string;

	// EME / DRM
	mediaKeys(): MediaKeys | undefined;
	setMediaKeys(keys: MediaKeys): Promise<void>;
	/** HDCP / output-protection capability of the current sink. */
	outputProtectionState(): 'unrestricted' | 'restricted' | 'unsupported';

	// Loader backpressure — caller pauses fetch when an upstream gate
	// (encoder, transcode pipeline) needs the buffer to drain first.
	pauseLoader(): void;
	resumeLoader(): void;
	loaderState(): BackendLoaderState;

	// Events — generic on the event name so each listener receives the correct
	// payload type automatically. No `any` at the call site.
	on<E extends BackendEvent>(event: E, fn: (data?: BackendEventPayload[E]) => void): void;
	off<E extends BackendEvent>(event: E, fn: (data?: BackendEventPayload[E]) => void): void;

	// ── Crossfade ────────────────────────────────────────────────────────────

	/**
	 * Returns `true` when this backend supports parallel playback required for
	 * crossfade. Both built-in backends return `true`. Custom backends that
	 * cannot allocate a second playback handle should return `false`; the player
	 * will throw `PlayerError('core:crossfade/unsupported')` rather than
	 * attempting the transition.
	 */
	supportsCrossfade(): boolean;

	/**
	 * Allocate the secondary playback handle and begin loading `url` into it
	 * without affecting primary playback. Safe to call multiple times with the
	 * same URL — subsequent calls with an already-loaded URL are no-ops.
	 *
	 * @param url - Fully-resolved media URL for the incoming track.
	 */
	loadSecondary(url: string): Promise<void>;

	/**
	 * Tear down the secondary handle: pause, disconnect, and release all
	 * resources. Idempotent — safe to call when no secondary is allocated.
	 */
	disposeSecondary(): void;

	/**
	 * Pre-roll the secondary so it is ready to play at `seekMs` (default 0).
	 * Waits for the `canplay` event on the secondary element before resolving.
	 *
	 * @param seekMs - Start position in milliseconds.
	 */
	primeSecondary(seekMs?: number): Promise<void>;

	/**
	 * Atomic crossfade: ramp primary gain → 0 and secondary gain → the
	 * player's current volume over `durationMs`. Starts secondary playback at
	 * t = 0. On completion the secondary becomes the primary; the old primary
	 * is disposed.
	 *
	 * NOTE (`AudioElementBackend`): fade is driven by a requestAnimationFrame
	 * loop at ~50 fps and is NOT sample-accurate. Expect sub-frame-length seams
	 * at track boundaries. Use `WebAudioBackend` for sample-accurate transitions.
	 *
	 * @param durationMs - Total crossfade duration in milliseconds. 0 = instant swap.
	 */
	crossfade(durationMs: number): Promise<void>;

	/**
	 * Read the secondary's current gain (0..1). Returns `0` when no secondary
	 * is allocated. Intended for test introspection and advanced callers that
	 * need to inspect mid-crossfade state.
	 */
	secondaryGain(): number;

	/**
	 * Write the secondary's gain directly (0..1). Clamped to [0, 1]. Has no
	 * effect when no secondary is allocated.
	 *
	 * @param value - Target gain in the range [0, 1].
	 */
	secondaryGain(value: number): void;
}
