import type {
	BackendEventPayload,
	BackendLoaderState,
	BackendState,
	IAudioBackend,
} from './IAudioBackend';

import { BrowserPolicyError, EventEmitter, HLS_EXT_RE } from '@nomercy-entertainment/nomercy-player-core';

const isHls = (url: string): boolean => HLS_EXT_RE.test(url);

function supportsNativeHls(audio: HTMLAudioElement): boolean {
	const can = audio.canPlayType('application/vnd.apple.mpegurl');
	return can === 'probably' || can === 'maybe';
}

interface HlsCtor {
	new (cfg?: unknown): {
		loadSource: (url: string) => void;
		attachMedia: (el: HTMLMediaElement) => void;
		destroy: () => void;
	};
	isSupported: () => boolean;
}

/**
 * HTML5 audio backend (fallback). Uses an HTMLAudioElement for transport. Lazily creates a
 * MediaElementAudioSourceNode the first time a plugin requests the analyser
 * graph (so consumers without EQ/spectrum pay zero Web Audio cost).
 *
 * HLS support comes from the kit's stream registry — the registry resolves
 * the URL to an IStreamSource (native or hls.js) and `attach()`es it to the
 * underlying `<audio>` element.
 *
 * Use `WebAudioBackend` when sample-accurate crossfades or full Web Audio
 * graph access are required. This backend is the safe fallback for environments
 * where Web Audio is restricted or undesired.
 */
export class AudioElementBackend extends EventEmitter<BackendEventPayload> implements IAudioBackend {
	readonly kind = 'audio-element' as const;

	private element: HTMLAudioElement;
	private ownsElement: boolean;
	private readonly container?: HTMLElement;
	private hlsInstance?: { destroy: () => void; startLoad?: () => void; stopLoad?: () => void };
	private currentState: BackendState = 'idle';
	private prevVolume: number = 1;
	private domHandlers: Array<{ event: string; handler: EventListener }> = [];
	private disposed = false;
	private sourceNode?: MediaElementAudioSourceNode;
	private sourceCtx?: AudioContext;
	private analyserNode?: AnalyserNode;
	private outputGain?: GainNode;
	private loaderRunning: BackendLoaderState = 'running';

	// ── Crossfade secondary ──────────────────────────────────────────────────
	private _secondary?: HTMLAudioElement;
	private _secondaryVol: number = 0;

	constructor(container?: HTMLElement, opts?: { element?: HTMLAudioElement }) {
		super();
		this.container = container;
		if (opts?.element) {
			this.element = opts.element;
			this.ownsElement = false;
		}
		else {
			let existing: HTMLAudioElement | null = null;
			if (container) {
				existing = container.querySelector('audio');
			}
			if (existing) {
				this.element = existing;
				this.ownsElement = false;
			}
			else {
				this.element = document.createElement('audio');
				this.element.preload = 'metadata';
				// crossOrigin is required for AudioGraph's createMediaElementSource()
				// to draw real samples on cross-origin sources. Without it, Web Audio
				// taints the element and outputs zeroes on any track served from a
				// different origin — every FMA / nomercy-media track silently dies.
				// `anonymous` triggers a CORS preflight on the audio fetch; origins
				// that respond with `Access-Control-Allow-Origin: *` (GitHub raw,
				// most CDNs) deliver real samples. Same-origin tracks are unaffected.
				this.element.crossOrigin = 'anonymous';
				this.ownsElement = true;
				if (container)
					container.appendChild(this.element);
			}
		}
		this.attachDomBridges();
	}

	private attachDomBridges(): void {
		this.domHandlers = [];

		const track = (domEvent: string, handler: EventListener): void => {
			this.element.addEventListener(domEvent, handler);
			this.domHandlers.push({
				event: domEvent,
				handler,
			});
		};

		track('loadstart', ev => this.emit('loadstart', ev));
		track('loadedmetadata', ev => this.emit('loadedmetadata', ev));
		track('canplay', ev => this.emit('canplay', ev));
		track('play', ev => this.emit('play', ev));
		track('playing', ev => this.emit('playing', ev));
		track('pause', ev => this.emit('pause', ev));
		track('ended', ev => this.emit('ended', ev));
		track('timeupdate', ev => this.emit('timeupdate', ev));
		track('waiting', ev => this.emit('waiting', ev));
		track('stalled', ev => this.emit('stalled', ev));
		track('ratechange', ev => this.emit('ratechange', ev));
		track('encrypted', ev => this.emit('encrypted', ev));
		track('error', ev => this.emit('error', ev));

		// State-mutation handlers tracked in the same array so detachDomBridges
		// and dispose always remove them — no separate cleanup path.
		track('loadstart', () => { this.currentState = 'loading'; });
		track('loadedmetadata', () => { this.currentState = 'ready'; });
		track('play', () => { this.currentState = 'playing'; });
		track('pause', () => {
			if (this.currentState !== 'idle' && this.currentState !== 'error') {
				this.currentState = 'paused';
			}
		});
		track('ended', () => { this.currentState = 'paused'; });
		track('error', () => { this.currentState = 'error'; });
	}

	private detachDomBridges(el: HTMLAudioElement): void {
		for (const { event, handler } of this.domHandlers) {
			el.removeEventListener(event, handler);
		}
		this.domHandlers = [];
	}

	async load(url: string, opts?: { preload: 'auto' | 'metadata' | 'none' }): Promise<void> {
		this.element.preload = opts?.preload ?? 'auto';
		this.currentState = 'loading';
		this.emit('backend:loading', {
			url,
			kind: this.kind,
		});

		if (this.hlsInstance) {
			try { this.hlsInstance.destroy(); }
			catch { /* ignore */ }
			this.hlsInstance = undefined;
		}

		const useHlsJs = isHls(url) && !supportsNativeHls(this.element);

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

			if (useHlsJs) {
				import(/* @vite-ignore */ 'hls.js')
					.then((mod) => {
						const Hls = (mod.default ?? mod) as unknown as HlsCtor;
						if (!Hls.isSupported()) {
							this.element.src = url;
							this.element.load();
							return;
						}
						const hls = new Hls();
						hls.attachMedia(this.element);
						hls.loadSource(url);
						this.hlsInstance = hls;
					})
					.catch((err: unknown) => {
						cleanup();
						reject(err);
					});
			}
			else {
				this.element.src = url;
				this.element.load();
			}
		});

		const duration = Number.isFinite(this.element.duration) ? this.element.duration : 0;
		this.currentState = 'ready';
		this.emit('backend:loaded', {
			url,
			kind: this.kind,
			duration,
		});
	}

	unload(): void {
		this.disposeSecondary();
		try { this.element.pause(); }
		catch { /* ignore */ }
		if (this.hlsInstance) {
			try { this.hlsInstance.destroy(); }
			catch { /* ignore */ }
			this.hlsInstance = undefined;
		}
		this.element.removeAttribute('src');
		try { this.element.load(); }
		catch { /* ignore */ }
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

	play(): Promise<void> {
		const result = this.element.play();
		return result instanceof Promise ? result : Promise.resolve();
	}

	pause(): void {
		this.element.pause();
	}

	stop(): void {
		this.element.pause();
		try { this.element.currentTime = 0; }
		catch { /* ignore */ }
	}

	currentTime(): number;
	currentTime(t: number): void;
	currentTime(t?: number): number | void {
		if (t === undefined)
			return this.element.currentTime;
		try { this.element.currentTime = t; }
		catch { /* element not ready — best effort */ }
	}

	duration(): number {
		const d = this.element.duration;
		return Number.isFinite(d) ? d : 0;
	}

	buffered(): number {
		const ranges = this.element.buffered;
		if (!ranges || ranges.length === 0)
			return 0;
		return ranges.end(ranges.length - 1);
	}

	bufferedRanges(): TimeRanges {
		return this.element.buffered;
	}

	seekable(): TimeRanges {
		return this.element.seekable;
	}

	playbackRate(): number;
	playbackRate(rate: number): void;
	playbackRate(rate?: number): number | void {
		if (rate === undefined)
			return this.element.playbackRate;
		this.element.playbackRate = rate;
	}

	volume(): number;
	volume(v: number): void;
	volume(v?: number): number | void {
		if (v === undefined)
			return this.element.volume;
		const clamped = Math.max(0, Math.min(1, v));
		this.element.volume = clamped;
		if (clamped > 0)
			this.prevVolume = clamped;
	}

	mute(): void {
		if (!this.element.muted) {
			this.prevVolume = this.element.volume || this.prevVolume;
			this.element.muted = true;
		}
	}

	unmute(): void {
		this.element.muted = false;
	}

	state(): BackendState {
		return this.currentState;
	}

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
			try { this.sourceNode.disconnect(); }
			catch { /* defensive */ }
			try { this.analyserNode?.disconnect(); }
			catch { /* defensive */ }
			try { this.outputGain?.disconnect(); }
			catch { /* defensive */ }
		}

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

	mediaElement(): HTMLMediaElement {
		return this.element;
	}

	captureStream(): MediaStream {
		const fn = (this.element as HTMLAudioElement & { captureStream?: () => MediaStream }).captureStream;
		if (typeof fn !== 'function') {
			throw new BrowserPolicyError({
				code: 'core:policy/captureStreamUnsupported',
				severity: 'error',
				scope: {
					kind: 'backend',
					id: 'audio-element',
				},
				message: 'HTMLAudioElement.captureStream() is not available in this environment.',
			});
		}
		return fn.call(this.element);
	}

	async setSinkId(deviceId: string): Promise<void> {
		const fn = (this.element as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }).setSinkId;
		if (typeof fn !== 'function') {
			throw new BrowserPolicyError({
				code: 'core:policy/setSinkIdUnsupported',
				severity: 'error',
				scope: {
					kind: 'backend',
					id: 'audio-element',
				},
				message: 'HTMLAudioElement.setSinkId() is not available in this environment.',
			});
		}
		await fn.call(this.element, deviceId);
	}

	getSinkId(): string {
		const v = (this.element as HTMLAudioElement & { sinkId?: string }).sinkId;
		return v ?? '';
	}

	mediaKeys(): MediaKeys | undefined {
		return this.element.mediaKeys ?? undefined;
	}

	async setMediaKeys(keys: MediaKeys): Promise<void> {
		const fn = (this.element as HTMLMediaElement & { setMediaKeys?: (k: MediaKeys) => Promise<void> }).setMediaKeys;
		if (typeof fn !== 'function') {
			throw new BrowserPolicyError({
				code: 'core:policy/emeUnsupported',
				severity: 'error',
				scope: {
					kind: 'backend',
					id: 'audio-element',
				},
				message: 'HTMLMediaElement.setMediaKeys() is not available in this environment.',
			});
		}
		await fn.call(this.element, keys);
	}

	outputProtectionState(): 'unrestricted' | 'restricted' | 'unsupported' {
		// HTMLAudioElement doesn't expose HDCP / output-protection probes —
		// audio sinks aren't HDCP-gated. Always 'unsupported' for this backend.
		return 'unsupported';
	}

	pauseLoader(): void {
		const stop = this.hlsInstance?.stopLoad;
		if (typeof stop === 'function')
			stop.call(this.hlsInstance);
		this.loaderRunning = 'paused';
	}

	resumeLoader(): void {
		const start = this.hlsInstance?.startLoad;
		if (typeof start === 'function')
			start.call(this.hlsInstance);
		this.loaderRunning = 'running';
	}

	loaderState(): BackendLoaderState {
		return this.loaderRunning;
	}

	// ── Crossfade ─────────────────────────────────────────────────────────────

	/** Both `<audio>`-element backends can allocate a second element. */
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

		const el = document.createElement('audio');
		el.preload = 'auto';
		// See primary-element createElement above — required for AudioGraph
		// to read real samples from cross-origin tracks during crossfade.
		el.crossOrigin = 'anonymous';
		el.volume = 0;
		el.style.display = 'none';
		if (this.container) {
			this.container.appendChild(el);
		}
		this._secondary = el;
		this._secondaryVol = 0;

		await new Promise<void>((resolve, reject) => {
			const onMeta = (): void => { cleanup(); resolve(); };
			const onErr = (): void => { cleanup(); reject(el.error ?? new Error('secondary load error')); };
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

	/**
	 * Pause + remove the secondary `<audio>` element from the DOM and clear
	 * the reference. Idempotent.
	 */
	disposeSecondary(): void {
		if (!this._secondary)
			return;
		try { this._secondary.pause(); }
		catch { /* ignore */ }
		this._secondary.removeAttribute('src');
		if (this._secondary.parentNode) {
			this._secondary.parentNode.removeChild(this._secondary);
		}
		this._secondary = undefined;
		this._secondaryVol = 0;
	}

	/**
	 * Wait for the secondary to be ready to play, then optionally seek to
	 * `seekMs`. Resolves immediately if `canplay` already fired.
	 *
	 * @param seekMs - Start position in milliseconds (default 0).
	 */
	async primeSecondary(seekMs?: number): Promise<void> {
		const el = this._secondary;
		if (!el)
			return;

		await new Promise<void>((resolve) => {
			if (el.readyState >= 3) {
				resolve();
				return;
			}
			el.addEventListener('canplay', () => resolve(), { once: true });
		});

		if (seekMs != null && seekMs > 0) {
			el.currentTime = seekMs / 1000;
		}
	}

	/**
	 * Ramp primary volume → 0 and secondary volume → primary's pre-fade
	 * volume over `durationMs`. Starts secondary playback at t = 0.
	 * On completion the secondary `<audio>` element becomes the new primary;
	 * the old primary element is disposed.
	 *
	 * @param durationMs - Crossfade duration in milliseconds. 0 = instant swap.
	 */
	async crossfade(durationMs: number): Promise<void> {
		const secondary = this._secondary;
		if (!secondary)
			throw new Error('crossfade() called without a loaded secondary');

		const startVolume = this.element.volume;

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
				const t = Math.min(1, elapsed / durationMs);

				this.element.volume = startVolume * (1 - t);
				secondary.volume = startVolume * t;
				this._secondaryVol = secondary.volume;

				if (t < 1) {
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
		this.detachDomBridges(old);
		try { old.pause(); }
		catch { /* ignore */ }
		old.removeAttribute('src');
		if (this.ownsElement && old.parentNode) {
			old.parentNode.removeChild(old);
		}

		this.element = secondary;
		this.ownsElement = true;
		this._secondary = undefined;
		this._secondaryVol = 0;

		// Re-attach DOM bridges to the new primary element.
		this.attachDomBridges();
	}

	secondaryGain(): number;
	secondaryGain(value: number): void;
	secondaryGain(value?: number): number | void {
		if (value === undefined) {
			return this._secondary ? this._secondary.volume : 0;
		}
		const clamped = Math.max(0, Math.min(1, value));
		this._secondaryVol = clamped;
		if (this._secondary) {
			this._secondary.volume = clamped;
		}
	}
}
