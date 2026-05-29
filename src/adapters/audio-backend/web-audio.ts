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
		stopLoad: () => void;
		startLoad: (startPosition?: number) => void;
	};
	isSupported: () => boolean;
}

/** Safari ships the Web Audio API under the vendor-prefixed name. */
interface WebkitAudioContextGlobal {
	AudioContext?: typeof AudioContext;
	webkitAudioContext?: typeof AudioContext;
}

function resolveAudioContext(existing?: AudioContext): AudioContext {
	const g = globalThis as unknown as WebkitAudioContextGlobal;
	const Ctor = g.AudioContext ?? g.webkitAudioContext;

	if (!Ctor) {
		throw new BrowserPolicyError({
			code: 'core:policy/audioContextUnsupported',
			scope: {
				kind: 'backend',
				id: 'webaudio',
			},
			message: 'Web Audio API is not available in this environment.',
			suggestion: 'Use a browser that supports the Web Audio API (all modern browsers).',
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
export class WebAudioBackend extends EventEmitter<BackendEventPayload> implements IAudioBackend {
	readonly kind = 'webaudio' as const;

	private readonly element: HTMLAudioElement;
	private readonly ownsElement: boolean;
	private readonly container?: HTMLElement;
	private domHandlers: Array<{ event: string; handler: EventListener }> = [];

	private ctx: AudioContext;
	private sourceNode?: MediaElementAudioSourceNode;
	private analyserNode?: AnalyserNode;
	private gainNode?: GainNode;

	private hlsInstance?: {
		destroy: () => void;
		stopLoad: () => void;
		startLoad: (pos?: number) => void;
	};

	private loaderPaused = false;
	private currentState: BackendState = 'idle';
	private prevVolume: number = 1;
	private disposed = false;

	// ── Crossfade secondary ──────────────────────────────────────────────────
	// Each crossfade allocates a fresh <audio> element + MediaElementAudioSourceNode
	// pair because createMediaElementSource() permanently binds an element to a
	// context — the same element cannot be reattached to a different source node.
	private _secondaryEl?: HTMLAudioElement;
	private _secondarySource?: MediaElementAudioSourceNode;
	private _secondaryGain?: GainNode;

	constructor(container?: HTMLElement, opts?: { audioContext?: AudioContext }) {
		super();
		this.ctx = resolveAudioContext(opts?.audioContext);

		this.container = container;

		// Reuse or create the <audio> element exactly as AudioElementBackend does.
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
			// crossOrigin required for createMediaElementSource on cross-origin URLs.
			this.element.crossOrigin = 'anonymous';
			this.ownsElement = true;
			if (container)
				container.appendChild(this.element);
		}

		this.attachDomBridges();
	}

	// ── Web Audio graph init ────────────────────────────────────────────────

	/**
	 * Lazily build the Web Audio graph on first call. Safe to call multiple
	 * times — subsequent calls return the already-created source node.
	 *
	 * NOTE: createMediaElementSource can only be called once per element. If
	 * the element was previously connected to a different context this will
	 * throw; callers sharing an element must pass in the same AudioContext.
	 */
	private ensureGraph(): MediaElementAudioSourceNode {
		if (this.sourceNode)
			return this.sourceNode;

		this.sourceNode = this.ctx.createMediaElementSource(this.element);
		this.gainNode = this.ctx.createGain();
		this.analyserNode = this.ctx.createAnalyser();
		this.analyserNode.fftSize = 2048;

		// Default routing: source → gain → analyser → destination.
		// Plugins can splice nodes by disconnecting / reconnecting from outputNode.
		this.sourceNode.connect(this.gainNode);
		this.gainNode.connect(this.analyserNode);
		this.analyserNode.connect(this.ctx.destination);

		return this.sourceNode;
	}

	// ── DOM event bridging ──────────────────────────────────────────────────

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

		// State-mutation handlers tracked in the same array so dispose always
		// removes them — no separate cleanup path.
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

	// ── Lifecycle ───────────────────────────────────────────────────────────

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

		// Ensure the Web Audio graph is wired before any decode begins.
		this.ensureGraph();

		const useHlsJs = isHls(url) && !supportsNativeHls(this.element);

		await new Promise<void>((resolve, reject) => {
			const onLoaded = (): void => { cleanup(); resolve(); };
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

		// Disconnect the Web Audio graph.
		try { this.sourceNode?.disconnect(); }
		catch { /* ignore */ }
		try { this.gainNode?.disconnect(); }
		catch { /* ignore */ }
		try { this.analyserNode?.disconnect(); }
		catch { /* ignore */ }
		this.sourceNode = undefined;
		this.gainNode = undefined;
		this.analyserNode = undefined;

		for (const { event, handler } of this.domHandlers) {
			this.element.removeEventListener(event, handler);
		}
		this.domHandlers = [];

		if (this.ownsElement && this.element.parentNode) {
			this.element.parentNode.removeChild(this.element);
		}
	}

	// ── Transport ───────────────────────────────────────────────────────────

	play(): Promise<void> {
		// Resume suspended context on play — required by browser autoplay policy.
		if (this.ctx.state === 'suspended') {
			this.ctx.resume().catch(() => { /* best-effort */ });
		}
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

	// ── Time / position ─────────────────────────────────────────────────────

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

	// ── Volume ──────────────────────────────────────────────────────────────
	//
	// Volume is applied via the GainNode when the graph is live so we get
	// sample-accurate ramping. Falls back to element volume before first load.

	volume(): number;
	volume(v: number): void;
	volume(v?: number): number | void {
		if (v === undefined) {
			return this.gainNode ? this.gainNode.gain.value : this.element.volume;
		}
		const clamped = Math.max(0, Math.min(1, v));
		if (this.gainNode) {
			// Ramp over 10 ms to avoid clicks — smooth per spec rules.
			const now = this.ctx.currentTime;
			this.gainNode.gain.setTargetAtTime(clamped, now, 0.01);
		}
		else {
			this.element.volume = clamped;
		}
		if (clamped > 0)
			this.prevVolume = clamped;
	}

	mute(): void {
		if (!this.element.muted) {
			this.prevVolume = this.gainNode
				? this.gainNode.gain.value
				: (this.element.volume || this.prevVolume);
			this.element.muted = true;
		}
	}

	unmute(): void {
		this.element.muted = false;
	}

	state(): BackendState {
		return this.currentState;
	}

	// ── Web Audio graph mount points ────────────────────────────────────────

	/**
	 * Returns the MediaElementAudioSourceNode. Plugins that need to inject
	 * processing nodes splice them after this node and before `analyserSource`.
	 *
	 * The returned node's context must match `ctx` — passing a different context
	 * after the graph is initialised will throw an InvalidStateError.
	 */
	outputNode(_ctx: AudioContext): AudioNode {
		return this.ensureGraph();
	}

	/**
	 * Returns the shared AnalyserNode tap. Spectrum / visualizer plugins read
	 * frequency and time-domain data from this node without disrupting the
	 * main gain chain.
	 */
	analyserSource(_ctx: AudioContext): AudioNode {
		this.ensureGraph();
		return this.analyserNode!;
	}

	// ── Raw element access ──────────────────────────────────────────────────

	mediaElement(): HTMLMediaElement {
		return this.element;
	}

	// ── MediaStream capture (for cast sender / recording plugins) ──────────

	captureStream(): MediaStream {
		const el = this.element as HTMLAudioElement & { captureStream?: () => MediaStream };
		if (typeof el.captureStream === 'function') {
			return el.captureStream();
		}
		throw new BrowserPolicyError({
			code: 'core:policy/captureStreamUnsupported',
			scope: {
				kind: 'backend',
				id: 'webaudio',
			},
			message: 'captureStream() is not supported in this browser.',
			suggestion: 'Use Chrome or another Chromium-based browser for stream capture.',
		});
	}

	// ── Audio output device routing ─────────────────────────────────────────

	setSinkId(deviceId: string): Promise<void> {
		const el = this.element as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
		if (typeof el.setSinkId !== 'function') {
			throw new BrowserPolicyError({
				code: 'core:policy/sinkIdUnsupported',
				scope: {
					kind: 'backend',
					id: 'webaudio',
				},
				message: 'setSinkId() is not supported in this browser.',
				suggestion: 'Use Chrome 49+ for audio output device selection.',
			});
		}
		return el.setSinkId(deviceId);
	}

	getSinkId(): string {
		const el = this.element as HTMLAudioElement & { sinkId?: string };
		if (typeof el.sinkId !== 'string') {
			throw new BrowserPolicyError({
				code: 'core:policy/sinkIdUnsupported',
				scope: {
					kind: 'backend',
					id: 'webaudio',
				},
				message: 'sinkId is not supported in this browser.',
				suggestion: 'Use Chrome 49+ for audio output device selection.',
			});
		}
		return el.sinkId;
	}

	// ── EME / DRM ───────────────────────────────────────────────────────────

	mediaKeys(): MediaKeys | undefined {
		return this.element.mediaKeys ?? undefined;
	}

	setMediaKeys(keys: MediaKeys): Promise<void> {
		return this.element.setMediaKeys(keys);
	}

	/**
	 * Returns 'unrestricted' as a placeholder. Real HDCP output-protection
	 * queries are platform-specific (CDM) and out of scope for the base backend.
	 * DRM plugins that need the real value override this via their own integration.
	 */
	outputProtectionState(): 'unrestricted' | 'restricted' | 'unsupported' {
		return 'unrestricted';
	}

	// ── Loader backpressure ─────────────────────────────────────────────────

	pauseLoader(): void {
		if (!this.hlsInstance)
			return;
		this.hlsInstance.stopLoad();
		this.loaderPaused = true;
	}

	resumeLoader(): void {
		if (!this.hlsInstance)
			return;
		this.hlsInstance.startLoad();
		this.loaderPaused = false;
	}

	loaderState(): BackendLoaderState {
		return this.loaderPaused ? 'paused' : 'running';
	}

	// ── Crossfade ─────────────────────────────────────────────────────────────

	/** GainNode-based crossfade is sample-accurate via the Web Audio scheduler. */
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
	 *
	 * @param url - Fully-resolved media URL for the incoming track.
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
			catch { /* context may be closed */ }
			try { gain.disconnect(); }
			catch { /* ignore */ }
		}
		if (source) {
			try { source.disconnect(); }
			catch { /* ignore */ }
		}

		try { el.pause(); }
		catch { /* ignore */ }
		el.removeAttribute('src');
		if (el.parentNode) {
			el.parentNode.removeChild(el);
		}

		this._secondaryEl = undefined;
		this._secondarySource = undefined;
		this._secondaryGain = undefined;
	}

	/**
	 * Wait for the secondary element to reach `readyState >= 3`, then
	 * optionally seek to `seekMs`.
	 *
	 * @param seekMs - Start position in milliseconds (default 0).
	 */
	async primeSecondary(seekMs?: number): Promise<void> {
		const el = this._secondaryEl;
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
	 * Schedule a GainNode crossfade using the Web Audio clock. Primary gain
	 * ramps to 0 and secondary gain ramps to the current primary volume over
	 * `durationMs`. Starts secondary playback immediately.
	 *
	 * Uses `linearRampToValueAtTime` — sample-accurate per the Web Audio spec.
	 *
	 * @param durationMs - Crossfade duration in milliseconds. 0 = instant swap.
	 */
	async crossfade(durationMs: number): Promise<void> {
		const secondaryEl = this._secondaryEl;
		const secondaryGain = this._secondaryGain;
		if (!secondaryEl || !secondaryGain) {
			throw new Error('crossfade() called without a loaded secondary');
		}

		// Resume suspended context (autoplay policy).
		if (this.ctx.state === 'suspended') {
			await this.ctx.resume().catch(() => { /* best-effort */ });
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

		secondaryEl.play().catch(() => { /* best-effort — autoplay may block */ });

		if (durationMs > 0) {
			await new Promise<void>(resolve => setTimeout(resolve, durationMs));
		}
	}

	secondaryGain(): number;
	secondaryGain(value: number): void;
	secondaryGain(value?: number): number | void {
		if (value === undefined) {
			return this._secondaryGain ? this._secondaryGain.gain.value : 0;
		}
		const clamped = Math.max(0, Math.min(1, value));
		if (this._secondaryGain) {
			this._secondaryGain.gain.value = clamped;
		}
	}
}
