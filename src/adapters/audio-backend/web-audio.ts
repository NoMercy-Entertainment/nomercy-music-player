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
	IAudioBackend,
} from './IAudioBackend';

import {
	appendAuthTokenParam,
	attachHlsOrFallback,
	BrowserPolicyError,
	isHls,
	MediaElementBackend,
	perceptualGain,
	primeSecondaryElement,
	supportsNativeHls,
} from '@nomercy-entertainment/nomercy-player-core';

/** Safari ships the Web Audio API under the vendor-prefixed name. */
interface WebkitAudioContextGlobal {
	AudioContext?: typeof AudioContext;
	webkitAudioContext?: typeof AudioContext;
}

function resolveAudioContext(existing?: AudioContext): AudioContext {
	const global = globalThis as unknown as WebkitAudioContextGlobal; // webkit prefix not in the TS DOM lib
	const Ctor = global.AudioContext ?? global.webkitAudioContext;

	if (!Ctor) {
		throw new BrowserPolicyError({
			code: 'core:policy/audioContextUnsupported',
			scope: {
				kind: 'backend',
				id: 'webaudio',
			},
			message: 'Web Audio API is not available in this environment.',
			suggestion:
        'Use a browser that supports the Web Audio API (all modern browsers).',
		});
	}

	return existing ?? new Ctor();
}

/**
 * Web Audio backend. Uses an `<audio>` element as the source so HLS via
 * hls.js works identically to `AudioElementBackend`. Routes audio through
 * an AudioContext so plugins can access the full Web Audio graph.
 *
 * Signal chain:
 *   <audio> → MediaElementAudioSourceNode → AnalyserNode → destination
 *
 * The AnalyserNode is a tap point — plugins splice effects between the
 * source and analyser, or after it, via `outputNode()` / `analyserSource()`.
 *
 * Construction throws `BrowserPolicyError` immediately when AudioContext is
 * unavailable — this backend requires Web Audio, never silently degrades.
 */
export class WebAudioBackend
	extends MediaElementBackend<HTMLAudioElement, BackendEventPayload>
	implements IAudioBackend {
	readonly kind = 'webaudio' as const;

	private readonly container?: HTMLElement;
	private ctx: AudioContext;
	private currentState: BackendState = 'idle';
	private prevVolume: number = 1;

	private sourceNode?: MediaElementAudioSourceNode;
	private analyserNode?: AnalyserNode;
	private gainNode?: GainNode;

	// ── Crossfade secondary ──────────────────────────────────────────────────
	// Each crossfade allocates a fresh <audio> element + MediaElementAudioSourceNode
	// pair because createMediaElementSource() permanently binds an element to a
	// context — the same element cannot be reattached to a different source node.
	private _secondaryEl?: HTMLAudioElement;
	private _secondarySource?: MediaElementAudioSourceNode;
	private _secondaryGain?: GainNode;

	constructor(container?: HTMLElement, opts?: { audioContext?: AudioContext }) {
		const resolved = WebAudioBackend.resolveElement(container);
		super(resolved.element, resolved.ownsElement, 'webaudio');
		this.ctx = resolveAudioContext(opts?.audioContext);
		this.container = container;

		this.attachDomBridges(
			(state: BackendState) => {
				this.currentState = state;
			},
			() => this.currentState,
		);
	}

	private static resolveElement(container?: HTMLElement): {
		element: HTMLAudioElement;
		ownsElement: boolean;
	} {
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
		// crossOrigin required for createMediaElementSource on cross-origin URLs.
		created.crossOrigin = 'anonymous';
		if (container) {
			container.appendChild(created);
		}
		return {
			element: created,
			ownsElement: true,
		};
	}

	// ── Web Audio graph init ────────────────────────────────────────────────

	/**
	 * Lazily build the Web Audio graph on first call. Safe to call multiple
	 * times — subsequent calls return the already-created gain node.
	 *
	 * Baseline routing: source → gainNode(volume) → analyserNode → destination.
	 * `gainNode` is the volume-control node and the public output point exposed
	 * by `outputNode()`. When `AudioGraphPlugin` takes ownership it disconnects
	 * `gainNode` from `analyserNode` and re-routes through the effect chain,
	 * but `gainNode` stays at the head so `volume()` always controls audible
	 * output — with or without the plugin stack.
	 */
	private ensureGraph(): GainNode {
		if (this.gainNode)
			return this.gainNode;

		this.sourceNode = this.ctx.createMediaElementSource(this.element);
		this.gainNode = this.ctx.createGain();
		this.analyserNode = this.ctx.createAnalyser();
		this.analyserNode.fftSize = 2048;

		this.sourceNode.connect(this.gainNode);
		this.gainNode.connect(this.analyserNode);
		this.analyserNode.connect(this.ctx.destination);

		return this.gainNode;
	}

	// ── Lifecycle ───────────────────────────────────────────────────────────

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
			try {
				this.hlsInstance.destroy();
			}
			catch {
				/* ignore */
			}
			this.hlsInstance = undefined;
		}

		// Ensure the Web Audio graph is wired before any decode begins.
		this.ensureGraph();

		const useHlsJs = isHls(url) && !supportsNativeHls(this.element);

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
						xhrSetup: (xhr: XMLHttpRequest) => {
							if (headerValue) {
								xhr.setRequestHeader('Authorization', headerValue);
							}
						},
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
			try {
				this.hlsInstance.destroy();
			}
			catch {
				/* ignore */
			}
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

		// Disconnect the Web Audio graph.
		try {
			this.sourceNode?.disconnect();
		}
		catch {
			/* ignore */
		}
		try {
			this.gainNode?.disconnect();
		}
		catch {
			/* ignore */
		}
		try {
			this.analyserNode?.disconnect();
		}
		catch {
			/* ignore */
		}
		this.sourceNode = undefined;
		this.gainNode = undefined;
		this.analyserNode = undefined;

		this.detachDomBridges(this.element);

		if (this.ownsElement && this.element.parentNode) {
			this.element.parentNode.removeChild(this.element);
		}
	}

	// ── Transport override (AudioContext resume before element play) ──────────

	override play(): Promise<void> {
		// Resume suspended context on play — required by browser autoplay policy.
		if (this.ctx.state === 'suspended') {
			this.ctx.resume().catch(() => {
				/* best-effort */
			});
		}
		const result = this.element.play();
		return result instanceof Promise ? result : Promise.resolve();
	}

	// ── Volume overrides (GainNode path + prevVolume bookkeeping) ─────────────

	override volume(): number;
	override volume(level: number): void;
	override volume(level?: number): number | void {
		if (level === undefined) {
			// Returns the curved gain amplitude currently on the node — NOT the
			// 0..1 slider position. The player mixin owns the position in
			// _internalVolume; consumers must not infer position from this value.
			return this.gainNode ? this.gainNode.gain.value : this.element.volume;
		}

		const clamped = Math.max(0, Math.min(1, level));
		const gain = perceptualGain(clamped);

		if (this.gainNode) {
			// Ramp over 10 ms to avoid clicks — smooth per spec rules.
			const now = this.ctx.currentTime;
			this.gainNode.gain.setTargetAtTime(gain, now, 0.01);
		}
		else {
			this.element.volume = gain;
		}

		if (clamped > 0) {
			this.prevVolume = gain;
		}
	}

	override mute(): void {
		if (!this.element.muted) {
			this.prevVolume = this.gainNode
				? this.gainNode.gain.value
				: this.element.volume || this.prevVolume;
			this.element.muted = true;
		}
	}

	// ── State ─────────────────────────────────────────────────────────────────

	state(): BackendState {
		return this.currentState;
	}

	// ── Web Audio graph mount points ────────────────────────────────────────

	/**
	 * Returns the `AudioContext` this backend owns. The player calls this
	 * immediately after construction and registers the context via
	 * `setPlayerAudioContext` so every plugin shares the same single context.
	 */
	audioContext(): AudioContext {
		return this.ctx;
	}

	/**
	 * Returns the volume `GainNode` — the public chain entry point for plugins.
	 *
	 * The parameter `_ctx` is accepted for interface compatibility but ignored —
	 * this backend owns its `AudioContext` at construction time.
	 */
	outputNode(_ctx: AudioContext): AudioNode {
		return this.ensureGraph();
	}

	/**
	 * Returns the shared `AnalyserNode` tap. Spectrum / visualizer plugins read
	 * frequency and time-domain data from this node without disrupting the
	 * main signal path.
	 *
	 * The parameter `_ctx` is accepted for interface compatibility but ignored.
	 */
	analyserSource(_ctx: AudioContext): AudioNode {
		this.ensureGraph();
		return this.analyserNode!;
	}

	/**
	 * Returns the `MediaElementAudioSourceNode` — the raw source BEFORE the
	 * volume `GainNode`. `AudioGraphPlugin` taps its `AnalyserNode` here so
	 * spectrum/FFT magnitudes are not scaled by the volume fader.
	 *
	 * The parameter `_ctx` is accepted for interface compatibility but ignored.
	 */
	analysisNode(_ctx: AudioContext): AudioNode {
		this.ensureGraph();
		return this.sourceNode!;
	}

	// ── IAudioBackend-required methods not on base ────────────────────────────

	buffered(): number {
		const ranges = this.element.buffered;
		if (!ranges || ranges.length === 0)
			return 0;
		return ranges.end(ranges.length - 1);
	}

	outputProtectionState(): 'unrestricted' | 'restricted' | 'unsupported' {
		// Returns 'unrestricted' as a placeholder. Real HDCP output-protection
		// queries are platform-specific (CDM) and out of scope for the base backend.
		// DRM plugins that need the real value override this via their own integration.
		return 'unrestricted';
	}

	override loaderState(): BackendLoaderState {
		return this.loaderPaused ? 'paused' : 'running';
	}

	override pauseLoader(): void {
		if (!this.hlsInstance)
			return;
		this.hlsInstance.stopLoad();
		this.loaderPaused = true;
	}

	override resumeLoader(): void {
		if (!this.hlsInstance)
			return;
		this.hlsInstance.startLoad();
		this.loaderPaused = false;
	}

	// ── Crossfade ─────────────────────────────────────────────────────────────

	supportsCrossfade(): boolean {
		return true;
	}

	/**
	 * Allocate a secondary `<audio>` element, wire it into the AudioContext via
	 * a fresh `MediaElementAudioSourceNode` → `GainNode` → `ctx.destination`
	 * chain, and begin loading `url`. Idempotent when called with the same URL.
	 *
	 * Each crossfade requires a new `<audio>` + `MediaElementAudioSourceNode`
	 * pair because `createMediaElementSource()` permanently binds an element to
	 * its context.
	 */
	async loadSecondary(url: string): Promise<void> {
		if (this._secondaryEl && this._secondaryEl.currentSrc === url)
			return;

		this.disposeSecondary();

		const el = document.createElement('audio');
		el.preload = 'auto';
		el.crossOrigin = 'anonymous';
		el.style.display = 'none';
		if (this.container) {
			this.container.appendChild(el);
		}

		const gainNode = this.ctx.createGain();
		gainNode.gain.value = 0;
		const sourceNode = this.ctx.createMediaElementSource(el);
		sourceNode.connect(gainNode);
		gainNode.connect(this.ctx.destination);

		this._secondaryEl = el;
		this._secondarySource = sourceNode;
		this._secondaryGain = gainNode;

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

			// Wire listeners synchronously — before any async yield — so events
			// dispatched by test stubs between now and the next microtask tick
			// are captured.
			el.addEventListener('loadedmetadata', onMeta, { once: true });
			el.addEventListener('error', onErr, { once: true });

			// Resolve auth then assign src. Structured as an immediately-invoked
			// async inner function so the outer Promise executor remains
			// synchronous (listeners registered above) while the async auth fetch
			// runs without losing the resolve/reject handles.
			void (async (): Promise<void> => {
				try {
					const headerValue = await this._authHeaderProvider?.();
					const useHlsJs = isHls(url) && !supportsNativeHls(el);
					const hlsMod = useHlsJs ? await import('hls.js') : undefined;

					if (useHlsJs && hlsMod) {
						attachHlsOrFallback(hlsMod.default, el, url, headerValue, {
							xhrSetup: (xhr: XMLHttpRequest) => {
								if (headerValue) {
									xhr.setRequestHeader('Authorization', headerValue);
								}
							},
						});
					}
					else {
						el.src = appendAuthTokenParam(url, headerValue);
						el.load();
					}
				}
				catch (err) {
					cleanup();
					reject(err);
				}
			})();
		});
	}

	/**
	 * Ramp the secondary's gain to 0 over 20 ms to avoid a click, then
	 * disconnect and release all secondary resources. Idempotent.
	 */
	disposeSecondary(): void {
		const gain = this._secondaryGain;
		const source = this._secondarySource;
		const el = this._secondaryEl;
		if (!el)
			return;

		if (gain) {
			try {
				const now = this.ctx.currentTime;
				gain.gain.setTargetAtTime(0, now, 0.005);
			}
			catch {
				/* context may be closed */
			}
			try {
				gain.disconnect();
			}
			catch {
				/* ignore */
			}
		}
		if (source) {
			try {
				source.disconnect();
			}
			catch {
				/* ignore */
			}
		}

		try {
			el.pause();
		}
		catch {
			/* ignore */
		}
		el.removeAttribute('src');
		if (el.parentNode) {
			el.parentNode.removeChild(el);
		}

		this._secondaryEl = undefined;
		this._secondarySource = undefined;
		this._secondaryGain = undefined;
	}

	/** Wait for the secondary element to reach `readyState >= 3`, then optionally seek to `seekMs`. */
	async primeSecondary(seekMs?: number): Promise<void> {
		const el = this._secondaryEl;
		if (!el)
			return;
		await primeSecondaryElement(el, seekMs);
	}

	/**
	 * Schedule a GainNode crossfade using the Web Audio clock. Primary gain
	 * ramps to 0 and secondary gain ramps to the current primary volume over
	 * `durationMs`. Starts secondary playback immediately.
	 *
	 * Uses `linearRampToValueAtTime` — sample-accurate per the Web Audio spec.
	 */
	async crossfade(durationMs: number): Promise<void> {
		const secondaryEl = this._secondaryEl;
		const secondaryGain = this._secondaryGain;
		if (!secondaryEl || !secondaryGain) {
			throw new Error('crossfade() called without a loaded secondary');
		}

		// Resume suspended context (autoplay policy).
		if (this.ctx.state === 'suspended') {
			await this.ctx.resume().catch(() => {
				/* best-effort */
			});
		}

		const primaryGain = this.gainNode;
		const targetVolume = primaryGain
			? primaryGain.gain.value
			: this.element.volume;

		const now = this.ctx.currentTime;
		const endTime = now + durationMs / 1000;

		if (durationMs <= 0) {
			if (primaryGain)
				primaryGain.gain.value = 0;
			secondaryGain.gain.value = targetVolume;
		}
		else {
			if (primaryGain) {
				primaryGain.gain.cancelScheduledValues(now);
				primaryGain.gain.setValueAtTime(primaryGain.gain.value, now);
				primaryGain.gain.linearRampToValueAtTime(0, endTime);
			}
			secondaryGain.gain.cancelScheduledValues(now);
			secondaryGain.gain.setValueAtTime(0, now);
			secondaryGain.gain.linearRampToValueAtTime(targetVolume, endTime);
		}

		secondaryEl.play().catch(() => {
			/* best-effort — autoplay may block */
		});

		if (durationMs > 0) {
			await new Promise<void>(resolve => setTimeout(resolve, durationMs));
		}

		// ── Promote secondary → primary ────────────────────────────────────────

		// 1. Disconnect and clear the old primary's Web Audio graph.
		const oldSource = this.sourceNode;
		const oldGain = this.gainNode;
		if (oldSource) {
			try {
				oldSource.disconnect();
			}
			catch {
				/* ignore */
			}
		}
		if (oldGain) {
			try {
				oldGain.disconnect();
			}
			catch {
				/* ignore */
			}
		}

		// 2. Detach DOM event bridges from the old primary.
		const oldEl = this.element;
		this.detachDomBridges(oldEl);

		// 3. Pause and release the old primary element.
		try {
			oldEl.pause();
		}
		catch {
			/* ignore */
		}
		oldEl.removeAttribute('src');
		if (this.ownsElement && oldEl.parentNode) {
			oldEl.parentNode.removeChild(oldEl);
		}

		// 4. Promote secondary fields to primary.
		this.element = secondaryEl;
		this.sourceNode = this._secondarySource;
		this.gainNode = this._secondaryGain;
		this.ownsElement = true;

		// 5. Clear secondary slots.
		this._secondaryEl = undefined;
		this._secondarySource = undefined;
		this._secondaryGain = undefined;

		// 6. Re-attach DOM bridges to the new primary element.
		this.attachDomBridges(
			(state: BackendState) => {
				this.currentState = state;
			},
			() => this.currentState,
		);

		// 7. Notify plugins that the active source changed. AudioGraphPlugin
		// listens for 'backend:sourceswap' to remount its chain on the new
		// volume gain node, keeping EQ / mixer routed through the correct graph.
		this.emit('backend:sourceswap', {
			sourceNode: this.gainNode!,
			analysisNode: this.sourceNode,
		});
	}

	secondaryGain(): number;
	secondaryGain(value: number): void;
	secondaryGain(value?: number): number | void {
		if (value === undefined) {
			return this._secondaryGain ? this._secondaryGain.gain.value : 0;
		}

		const clamped = Math.max(0, Math.min(1, value));
		const gain = perceptualGain(clamped);

		if (this._secondaryGain) {
			const now = this.ctx.currentTime;
			this._secondaryGain.gain.setTargetAtTime(gain, now, 0.01);
		}
	}

	// ── Private loaderPaused field (replaces base loaderRunning for this backend) ──

	private loaderPaused: boolean = false;
}
