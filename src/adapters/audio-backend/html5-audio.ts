// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type {
	BackendEventPayload,
	BackendLoaderState,
	BackendState,
	CrossfadeCurve,
	IAudioBackend,
} from './IAudioBackend';

import {
	appendAuthTokenParam,
	attachHlsOrFallback,
	createAuthorizationXhrSetup,
	createSecondaryAudioElement,
	destroyHlsInstance,
	isHls,
	MediaElementBackend,
	perceptualGain,
	primeSecondaryElement,
	supportsNativeHls,
} from '@nomercy-entertainment/nomercy-player-core';

/**
 * HTML5 audio backend (fallback). Uses an HTMLAudioElement for transport.
 * Lazily creates a `MediaElementAudioSourceNode` the first time a plugin
 * requests the analyser graph (so consumers without EQ/spectrum pay zero
 * Web Audio cost).
 *
 * Use `WebAudioBackend` when sample-accurate crossfades or full Web Audio
 * graph access are required. This backend is the safe fallback for
 * environments where Web Audio is restricted or undesired.
 */
export class AudioElementBackend
	extends MediaElementBackend<HTMLAudioElement, BackendEventPayload>
	implements IAudioBackend {
	readonly kind = 'audio-element' as const;

	private readonly container?: HTMLElement;
	private currentState: BackendState = 'idle';

	private prevVolume: number = 1;
	private sourceNode?: MediaElementAudioSourceNode;
	private sourceCtx?: AudioContext;
	private analyserNode?: AnalyserNode;
	private outputGain?: GainNode;

	// ── Crossfade secondary ──────────────────────────────────────────────────
	private _secondary?: HTMLAudioElement;
	private _secondaryVol: number = 0;

	constructor(container?: HTMLElement, opts?: { element?: HTMLAudioElement }) {
		const resolved = AudioElementBackend.resolveElement(container, opts);
		super(resolved.element, resolved.ownsElement, 'audio-element');
		this.container = container;

		this.attachDomBridges(
			(state: BackendState) => {
				this.currentState = state;
			},
			() => this.currentState,
		);
	}

	private static resolveElement(
		container?: HTMLElement,
		opts?: { element?: HTMLAudioElement },
	): { element: HTMLAudioElement; ownsElement: boolean } {
		if (opts?.element) {
			return {
				element: opts.element,
				ownsElement: false,
			};
		}

		if (container) {
			const existing = container.querySelector<HTMLAudioElement>('audio');
			if (existing) {
				return {
					element: existing,
					ownsElement: false,
				};
			}
		}

		const created = document.createElement('audio');
		created.preload = 'metadata';
		// crossOrigin is left unset on purpose: forcing 'anonymous' breaks
		// playback on servers that don't send CORS headers (P-2 regression).
		// It is set lazily in ensureSourceGraph() only when a plugin taps the
		// Web Audio graph, where CORS is actually required.
		if (container) {
			container.appendChild(created);
		}
		return {
			element: created,
			ownsElement: true,
		};
	}

	// ── Lifecycle ─────────────────────────────────────────────────────────────

	async load(
		url: string,
		opts?: { preload: 'auto' | 'metadata' | 'none' },
	): Promise<void> {
		this.element.preload = opts?.preload ?? 'auto';
		this.currentState = 'loading';
		this.emit('backend:loading', {
			url,
			kind: this.kind,
		});

		if (this.hlsInstance) {
			destroyHlsInstance(this.hlsInstance);
			this.hlsInstance = undefined;
		}

		const useHlsJs = isHls(url) && !supportsNativeHls(this.element);

		// Resolve auth header before entering the Promise so the executor stays synchronous.
		const headerValue = await this._authHeaderProvider?.();
		const hlsMod = useHlsJs ? await import('hls.js') : undefined;

		await new Promise<void>((resolve, reject) => {
			const onLoaded = (): void => {
				cleanup();
				resolve();
			};
			const onError = (): void => {
				cleanup();
				reject(this.element.error ?? new Error('audio element load error'));
			};
			const cleanup = (): void => {
				this.element.removeEventListener('loadedmetadata', onLoaded);
				this.element.removeEventListener('error', onError);
			};

			this.element.addEventListener('loadedmetadata', onLoaded, { once: true });
			this.element.addEventListener('error', onError, { once: true });

			if (useHlsJs && hlsMod) {
				this.hlsInstance
					= attachHlsOrFallback(hlsMod.default, this.element, url, headerValue, {
						autoStartLoad: true,
						enableWorker: true,
						lowLatencyMode: false,
						enableCEA708Captions: true,
						xhrSetup: createAuthorizationXhrSetup(headerValue),
					}) ?? undefined;
			}
			else {
				this.element.src = appendAuthTokenParam(url, headerValue);
				this.element.load();
			}
		});

		const dur = Number.isFinite(this.element.duration)
			? this.element.duration
			: 0;
		this.currentState = 'ready';
		this.emit('backend:loaded', {
			url,
			kind: this.kind,
			duration: dur,
		});
	}

	unload(): void {
		this.disposeSecondary();
		try {
			this.element.pause();
		}
		catch {
			/* ignore */
		}
		if (this.hlsInstance) {
			destroyHlsInstance(this.hlsInstance);
			this.hlsInstance = undefined;
		}
		this.element.removeAttribute('src');
		try {
			this.element.load();
		}
		catch {
			/* ignore */
		}
		this.currentState = 'idle';
	}

	dispose(): void {
		if (this.disposed)
			return;
		this.disposed = true;
		this.disposeSecondary();
		this.unload();
		this.detachDomBridges(this.element);
		if (this.ownsElement && this.element.parentNode) {
			this.element.parentNode.removeChild(this.element);
		}
	}

	// ── Volume overrides (adds prevVolume bookkeeping) ─────────────────────────

	override volume(): number;
	override volume(level: number): void;
	override volume(level?: number): number | void {
		if (level === undefined) {
			return this.element.volume;
		}

		const clamped = Math.max(0, Math.min(1, level));
		const gain = perceptualGain(clamped);
		this.element.volume = gain;

		if (clamped > 0) {
			this.prevVolume = gain;
		}
	}

	override mute(): void {
		if (!this.element.muted) {
			this.prevVolume = this.element.volume || this.prevVolume;
			this.element.muted = true;
		}
	}

	// ── State ─────────────────────────────────────────────────────────────────

	state(): BackendState {
		return this.currentState;
	}

	// ── Web Audio graph tap ───────────────────────────────────────────────────

	outputNode(ctx: AudioContext): AudioNode {
		this.ensureSourceGraph(ctx);
		return this.outputGain!;
	}

	analyserSource(ctx: AudioContext): AudioNode {
		this.ensureSourceGraph(ctx);
		return this.analyserNode!;
	}

	private ensureSourceGraph(ctx: AudioContext): void {
		if (this.sourceNode && this.sourceCtx === ctx)
			return;

		// Different context (consumer swapped AudioContext) — drop the old graph.
		if (this.sourceNode && this.sourceCtx !== ctx) {
			try {
				this.sourceNode.disconnect();
			}
			catch {
				/* defensive */
			}
			try {
				this.analyserNode?.disconnect();
			}
			catch {
				/* defensive */
			}
			try {
				this.outputGain?.disconnect();
			}
			catch {
				/* defensive */
			}
		}

		// A graph tap is being requested. The element's output now flows through
		// the AudioContext, and the browser feeds SILENCE into the graph for a
		// cross-origin element that lacks CORS (tainted source). Set crossOrigin
		// here — not at construction — so plain direct-transport playback stays
		// CORS-free for servers that don't send CORS headers (P-2 regression).
		// crossOrigin only takes effect on the next load, so if a source is
		// already attached, re-load it (preserving position) before tapping.
		this.applyGraphCrossOrigin();

		this.sourceCtx = ctx;
		this.sourceNode = ctx.createMediaElementSource(this.element);
		this.analyserNode = ctx.createAnalyser();
		this.outputGain = ctx.createGain();
		this.sourceNode.connect(this.analyserNode);
		this.analyserNode.connect(this.outputGain);

		// Baseline routing: outputGain → destination so audio is audible without
		// any plugin. AudioGraphPlugin disconnects this and re-routes through its
		// effect chain when it takes ownership via outputNode(ctx).
		this.outputGain.connect(ctx.destination);
	}

	/**
	 * Set `crossOrigin = 'anonymous'` so `createMediaElementSource()` receives
	 * audible (untainted) samples for cross-origin media. The attribute only
	 * applies to the NEXT resource load, so when a source is already attached we
	 * re-load it and restore the playback position. Same-origin and already-set
	 * elements are left untouched, and a missing src needs no reload.
	 */
	private applyGraphCrossOrigin(): void {
		if (this.element.crossOrigin === 'anonymous')
			return;

		const hadSource = this.element.currentSrc !== '' || this.element.src !== '';
		const position = this.element.currentTime;
		const wasPlaying = !this.element.paused;

		this.element.crossOrigin = 'anonymous';

		if (!hadSource)
			return;

		const restore = (): void => {
			try {
				this.element.currentTime = position;
			}
			catch {
				/* element not seekable yet — best effort */
			}
			if (wasPlaying) {
				void this.element.play().catch(() => {
					/* autoplay policy — best effort */
				});
			}
		};
		this.element.addEventListener('loadedmetadata', restore, { once: true });
		this.element.load();
	}

	// ── IAudioBackend-required methods not on base ────────────────────────────

	buffered(): number {
		const ranges = this.element.buffered;
		if (!ranges || ranges.length === 0)
			return 0;
		return ranges.end(ranges.length - 1);
	}

	outputProtectionState(): 'unrestricted' | 'restricted' | 'unsupported' {
		// HTMLAudioElement doesn't expose HDCP / output-protection probes —
		// audio sinks aren't HDCP-gated. Always 'unsupported' for this backend.
		return 'unsupported';
	}

	override loaderState(): BackendLoaderState {
		return this.loaderRunning;
	}

	// ── Crossfade ─────────────────────────────────────────────────────────────

	supportsCrossfade(): boolean {
		return true;
	}

	/**
	 * Allocate a hidden secondary `<audio>` element and load `url` into it.
	 * Does not affect primary playback. Idempotent when called with the same
	 * URL that is already loaded on the secondary.
	 *
	 * NOTE: Dual-element fade is driven by a ~50 fps RAF loop and is NOT
	 * sample-accurate. Use `WebAudioBackend` for sample-accurate crossfades.
	 */
	async loadSecondary(url: string): Promise<void> {
		if (this._secondary && this._secondary.currentSrc === url)
			return;

		this.disposeSecondary();

		const el = createSecondaryAudioElement(
			this.container,
			this.element.crossOrigin,
		);
		el.volume = 0;
		this._secondary = el;
		this._secondaryVol = 0;

		await new Promise<void>((resolve, reject) => {
			const onMeta = (): void => {
				cleanup();
				resolve();
			};
			const onErr = (): void => {
				cleanup();
				reject(el.error ?? new Error('secondary load error'));
			};
			const cleanup = (): void => {
				el.removeEventListener('loadedmetadata', onMeta);
				el.removeEventListener('error', onErr);
			};
			el.addEventListener('loadedmetadata', onMeta, { once: true });
			el.addEventListener('error', onErr, { once: true });
			el.src = url;
			el.load();
		});
	}

	/** Pause + remove the secondary element and clear the reference. Idempotent. */
	disposeSecondary(): void {
		if (!this._secondary)
			return;
		try {
			this._secondary.pause();
		}
		catch {
			/* ignore */
		}
		this._secondary.removeAttribute('src');
		if (this._secondary.parentNode) {
			this._secondary.parentNode.removeChild(this._secondary);
		}
		this._secondary = undefined;
		this._secondaryVol = 0;
	}

	/** Wait for the secondary to be ready to play, then optionally seek to `seekMs`. */
	async primeSecondary(seekMs?: number): Promise<void> {
		const el = this._secondary;
		if (!el)
			return;
		await primeSecondaryElement(el, seekMs);
	}

	/**
	 * Ramp primary volume → 0 and secondary volume → primary's pre-fade
	 * volume over `durationMs`. Starts secondary playback at t = 0.
	 * On completion the secondary element becomes the new primary; the old
	 * primary element is disposed.
	 *
	 * `curve: 'equal-power'` shapes both trajectories with the constant-power
	 * cosine (same math as the kit's `CrossfadeTransitionStrategy`); omitted or
	 * `'linear'` keeps the plain linear ramp.
	 */
	async crossfade(durationMs: number, curve?: CrossfadeCurve): Promise<void> {
		const secondary = this._secondary;
		if (!secondary)
			throw new Error('crossfade() called without a loaded secondary');

		const startVolume = this.element.volume;
		const equalPower = curve === 'equal-power';

		secondary.volume = 0;
		this._secondaryVol = 0;
		await secondary.play();

		await new Promise<void>((resolve) => {
			if (durationMs <= 0) {
				this.element.volume = 0;
				secondary.volume = startVolume;
				this._secondaryVol = startVolume;
				resolve();
				return;
			}

			const startTime = performance.now();
			const tick = (): void => {
				const elapsed = performance.now() - startTime;
				const progress = Math.min(1, elapsed / durationMs);
				const outGain = equalPower ? Math.cos(progress * 0.5 * Math.PI) : 1 - progress;
				const inGain = equalPower ? Math.cos((1 - progress) * 0.5 * Math.PI) : progress;

				this.element.volume = startVolume * outGain;
				secondary.volume = startVolume * inGain;
				this._secondaryVol = secondary.volume;

				if (progress < 1) {
					requestAnimationFrame(tick);
				}
				else {
					resolve();
				}
			};
			requestAnimationFrame(tick);
		});

		// Swap: old primary is silenced; secondary takes the primary slot.
		const old = this.element;
		// A fresh secondary element defaults muted=false — carry the flag across.
		secondary.muted = old.muted;
		this.detachDomBridges(old);
		try {
			old.pause();
		}
		catch {
			/* ignore */
		}
		old.removeAttribute('src');
		if (this.ownsElement && old.parentNode) {
			old.parentNode.removeChild(old);
		}

		this.element = secondary;
		this.ownsElement = true;
		this._secondary = undefined;
		this._secondaryVol = 0;

		// Re-attach DOM bridges to the new primary element.
		this.attachDomBridges(
			(state: BackendState) => {
				this.currentState = state;
			},
			() => this.currentState,
		);
	}

	secondaryGain(): number;
	secondaryGain(value: number): void;
	secondaryGain(value?: number): number | void {
		if (value === undefined) {
			return this._secondary ? this._secondary.volume : 0;
		}

		const clamped = Math.max(0, Math.min(1, value));
		const gain = perceptualGain(clamped);
		this._secondaryVol = gain;
		if (this._secondary) {
			this._secondary.volume = gain;
		}
	}
}
