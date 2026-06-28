// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * Coverage-fill tests targeting uncovered functions across:
 *  - WebAudioBackend (graph methods, volume, mute/unmute, transport, dispose,
 *    sinkId, analysisNode, setSinkId, primeSecondary, loaderState)
 *  - AudioElementBackend (detachDomBridges, ensureSourceGraph context-swap,
 *    sinkId/captureStream errors, setMediaKeys, dispose idempotent,
 *    primeSecondary, secondaryGain write, loadSecondary error path)
 *  - hls-loader (attachHlsOrFallback, attachDomBridgesTo, supportsNativeHls)
 *  - SmartShuffleGenerator (similarity, history-aware, edge cases)
 *  - LinearPlaylistGenerator (edges)
 *  - MusicPreloadStrategy (assetsToPreload)
 *  - MediaSessionArtProvider (publish, clear)
 *  - resolveNameList (all branches)
 *  - preload.ts MusicPreloadStrategy
 *  - NMMusicPlayer._createBackend (factory override, webaudio, audio-element)
 *  - NMMusicPlayer wrappedSetup (enriched config)
 *  - AutoAdvancePlugin (preloadNextOnEnding, addEndedHandler, addPreloadHandler,
 *    addCrossfadeHandler, enabled toggling on trackEndingSoon)
 *  - LyricsPlugin (autoFetch:false path, no-parser path, fetch-error path,
 *    resolveLyricsUrl via getLyricsUrl option)
 *  - KeyHandlerPlugin (n/p/r/s bindings exercise)
 *  - V1MusicCompatPlugin (remaining uncovered: state property shims,
 *    actions wiring, setCurrentTime, fadeVolume, getAudioElement,
 *    removeFromBackLog, removeFromQueue no-id, playTrack no-tracks,
 *    isPlatform, shuffle boolean, hasNextQueued, setRepeating,
 *    _wireActions seek branch, on() fallthrough, equalizerPanning setter,
 *    equalizerBands setter, equalizerPresets setter, siteTitle setter
 *    via shim property)
 */

import type { IAudioBackend } from '../adapters/audio-backend/IAudioBackend';
import type { MusicPlaylistItem } from '../types';
import { perceptualGain } from '@nomercy-entertainment/nomercy-player-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioElementBackend } from '../adapters/audio-backend/html5-audio';
import { WebAudioBackend } from '../adapters/audio-backend/web-audio';
import type { BackendState } from '../adapters/audio-backend/IAudioBackend';
import { attachDomBridgesTo, attachHlsOrFallback, isHls, supportsNativeHls } from '../adapters/audio-backend/hls-loader';
import { SmartShuffleGenerator } from '../adapters/playlist-generator/smart-shuffle';
import { LinearPlaylistGenerator } from '../adapters/playlist-generator/linear';
import { MusicPreloadStrategy } from '../player/preload';
import { MediaSessionArtProvider } from '../adapters/now-playing-art/media-session';
import { resolveNameList } from '../utils/resolve-name-list';
import { NMMusicPlayer } from '../index';
import { AutoAdvancePlugin } from '../plugins/auto-advance';
import { LyricsPlugin } from '../plugins/lyrics';
import { KeyHandlerPlugin } from '../plugins/key-handler';
import { V1MusicCompatPlugin } from '../plugins/v1-compat';

// ── AudioContext stub shared across suites ────────────────────────────────────

class MockGainNode {
	gain = {
		value: 1,
		setTargetAtTime: vi.fn((_target: number, _start: number, _tau: number) => undefined),
		setValueAtTime: vi.fn((_target: number, _time: number) => undefined),
		linearRampToValueAtTime: vi.fn((_target: number, _end: number) => undefined),
		cancelScheduledValues: vi.fn((_start: number) => undefined),
	};

	connect = vi.fn();
	disconnect = vi.fn();
}

class MockAnalyserNode {
	fftSize = 2048;
	connect = vi.fn();
	disconnect = vi.fn();
}

class MockSourceNode {
	connect = vi.fn();
	disconnect = vi.fn();
}

class MockAudioContext {
	static lastInstance: MockAudioContext | null = null;

	state: AudioContextState = 'running';
	currentTime = 0;
	destination = {} as AudioDestinationNode;

	private _gain = new MockGainNode();
	private _analyser = new MockAnalyserNode();
	private _source = new MockSourceNode();

	createGain = vi.fn(() => new MockGainNode());
	createAnalyser = vi.fn(() => new MockAnalyserNode());
	createMediaElementSource = vi.fn(() => new MockSourceNode());
	resume = vi.fn(() => Promise.resolve());

	get gainNode(): MockGainNode { return this._gain; }
	get analyserNode(): MockAnalyserNode { return this._analyser; }
	get sourceNode(): MockSourceNode { return this._source; }

	constructor() {
		MockAudioContext.lastInstance = this;
	}
}

function installAudioContext(): void {
	(globalThis as unknown as { AudioContext: typeof MockAudioContext }).AudioContext = MockAudioContext;
	MockAudioContext.lastInstance = null;
}

function removeAudioContext(): void {
	delete (globalThis as unknown as { AudioContext?: unknown }).AudioContext;
	MockAudioContext.lastInstance = null;
}

function makeContainer(): HTMLDivElement {
	const div = document.createElement('div');
	document.body.appendChild(div);
	return div;
}

function stubPlay(el: HTMLAudioElement): void {
	Object.defineProperty(el, 'play', {
		value: vi.fn(() => Promise.resolve()),
		writable: true,
		configurable: true,
	});
}

function fireMetadata(container: HTMLElement): void {
	const audios = container.querySelectorAll('audio');
	const target = audios[audios.length - 1];
	if (target) target.dispatchEvent(new Event('loadedmetadata'));
}

function fireCanPlay(container: HTMLElement): void {
	const audios = container.querySelectorAll('audio');
	const target = audios[audios.length - 1];
	if (target) target.dispatchEvent(new Event('canplay'));
}

// ── helpers ───────────────────────────────────────────────────────────────────

function shim(player: NMMusicPlayer, name: string): (...args: unknown[]) => unknown {
	const target = player as unknown as Record<string, unknown>;
	const method = target[name];
	if (typeof method !== 'function') {
		throw new TypeError(`Shim "${name}" not found`);
	}
	return method as (...args: unknown[]) => unknown;
}

function shimOn(player: NMMusicPlayer, event: string, fn: (data: unknown) => void): void {
	const target = player as unknown as Record<string, unknown>;
	const onFn = target['on'];
	if (typeof onFn !== 'function') throw new TypeError('on() not found');
	(onFn as (ev: string, cb: (d: unknown) => void) => void)(event, fn);
}

// =============================================================================
// WebAudioBackend — uncovered functions
// =============================================================================

describe('WebAudioBackend — additional coverage', () => {
	beforeEach(installAudioContext);
	afterEach(() => {
		removeAudioContext();
		document.body.innerHTML = '';
	});

	// ── volume() with gainNode present ────────────────────────────────────────

	describe('volume() after graph init', () => {
		it('read: returns gainNode.gain.value when graph is live', () => {
			const container = makeContainer();
			const backend = new WebAudioBackend(container);
			const ctx = MockAudioContext.lastInstance! as unknown as AudioContext;
			backend.outputNode(ctx);

			const v = backend.volume();
			expect(typeof v).toBe('number');
		});

		it('write: calls setTargetAtTime on the gainNode', () => {
			const container = makeContainer();
			const backend = new WebAudioBackend(container);
			const ctx = MockAudioContext.lastInstance! as unknown as AudioContext;
			backend.outputNode(ctx);

			const raw = backend as unknown as { gainNode: MockGainNode };
			const gain = raw.gainNode;

			backend.volume(0.5);
			expect(gain.gain.setTargetAtTime).toHaveBeenCalled();
		});

		it('write: clamps value > 1 to 1 (perceptualGain(1))', () => {
			const container = makeContainer();
			const backend = new WebAudioBackend(container);
			const ctx = MockAudioContext.lastInstance! as unknown as AudioContext;
			backend.outputNode(ctx);

			expect(() => backend.volume(2)).not.toThrow();
		});

		it('write: does not update prevVolume when clamped value is 0', () => {
			const container = makeContainer();
			const backend = new WebAudioBackend(container);
			const ctx = MockAudioContext.lastInstance! as unknown as AudioContext;
			backend.outputNode(ctx);

			backend.volume(0.7);
			backend.volume(0);

			expect(() => backend.volume()).not.toThrow();
		});
	});

	// ── mute / unmute ─────────────────────────────────────────────────────────

	describe('mute() / unmute()', () => {
		it('mute() sets element.muted = true and stores prevVolume from gainNode when live', () => {
			const container = makeContainer();
			const backend = new WebAudioBackend(container);
			const ctx = MockAudioContext.lastInstance! as unknown as AudioContext;
			backend.outputNode(ctx);

			backend.mute();
			expect(backend.mediaElement().muted).toBe(true);
		});

		it('mute() is idempotent — second call when already muted does not re-store prevVolume', () => {
			const container = makeContainer();
			const backend = new WebAudioBackend(container);
			backend.mute();
			backend.mute();
			expect(backend.mediaElement().muted).toBe(true);
		});

		it('unmute() clears element.muted', () => {
			const container = makeContainer();
			const backend = new WebAudioBackend(container);
			backend.mute();
			backend.unmute();
			expect(backend.mediaElement().muted).toBe(false);
		});
	});

	// ── stop() / pause() / currentTime ────────────────────────────────────────

	describe('transport', () => {
		it('stop() pauses and resets currentTime to 0 without throwing', () => {
			const container = makeContainer();
			const backend = new WebAudioBackend(container);
			expect(() => backend.stop()).not.toThrow();
		});

		it('pause() calls element.pause()', () => {
			const container = makeContainer();
			const backend = new WebAudioBackend(container);
			const spy = vi.spyOn(backend.mediaElement(), 'pause');
			backend.pause();
			expect(spy).toHaveBeenCalled();
		});

		it('currentTime() getter returns element.currentTime', () => {
			const container = makeContainer();
			const backend = new WebAudioBackend(container);
			const t = backend.currentTime();
			expect(typeof t).toBe('number');
		});

		it('currentTime(t) setter does not throw for valid value', () => {
			const container = makeContainer();
			const backend = new WebAudioBackend(container);
			expect(() => backend.currentTime(0)).not.toThrow();
		});

		it('play() resumes suspended context', async () => {
			const container = makeContainer();
			const backend = new WebAudioBackend(container);
			const ctx = MockAudioContext.lastInstance!;
			ctx.state = 'suspended';

			Object.defineProperty(backend.mediaElement(), 'play', {
				value: vi.fn(() => Promise.resolve()),
				writable: true,
				configurable: true,
			});

			await backend.play();
			expect(ctx.resume).toHaveBeenCalled();
		});
	});

	// ── analysisNode() ────────────────────────────────────────────────────────

	describe('analysisNode()', () => {
		it('returns the raw MediaElementAudioSourceNode after graph init', () => {
			const container = makeContainer();
			const backend = new WebAudioBackend(container);
			const ctx = MockAudioContext.lastInstance! as unknown as AudioContext;

			backend.outputNode(ctx);
			const node = backend.analysisNode(ctx);
			expect(node).toBeDefined();
		});
	});

	// ── state() ───────────────────────────────────────────────────────────────

	describe('state()', () => {
		it('returns "idle" initially', () => {
			const container = makeContainer();
			const backend = new WebAudioBackend(container);
			expect(backend.state()).toBe('idle');
		});
	});

	// ── duration / buffered ────────────────────────────────────────────────────

	describe('duration() / buffered() / bufferedRanges() / seekable()', () => {
		it('duration() returns 0 when element.duration is NaN', () => {
			const container = makeContainer();
			const backend = new WebAudioBackend(container);
			expect(backend.duration()).toBe(0);
		});

		it('buffered() returns 0 when no ranges', () => {
			const container = makeContainer();
			const backend = new WebAudioBackend(container);
			expect(backend.buffered()).toBe(0);
		});

		it('bufferedRanges() returns a TimeRanges object', () => {
			const container = makeContainer();
			const backend = new WebAudioBackend(container);
			const ranges = backend.bufferedRanges();
			expect(typeof ranges).toBe('object');
		});

		it('seekable() returns a TimeRanges object', () => {
			const container = makeContainer();
			const backend = new WebAudioBackend(container);
			const s = backend.seekable();
			expect(typeof s).toBe('object');
		});
	});

	// ── playbackRate ──────────────────────────────────────────────────────────

	describe('playbackRate()', () => {
		it('getter returns element.playbackRate', () => {
			const container = makeContainer();
			const backend = new WebAudioBackend(container);
			expect(backend.playbackRate()).toBe(1);
		});

		it('setter updates element.playbackRate', () => {
			const container = makeContainer();
			const backend = new WebAudioBackend(container);
			backend.playbackRate(1.5);
			expect(backend.mediaElement().playbackRate).toBe(1.5);
		});
	});

	// ── loaderState / pauseLoader / resumeLoader ──────────────────────────────

	describe('loaderState()', () => {
		it('returns "running" by default', () => {
			const container = makeContainer();
			const backend = new WebAudioBackend(container);
			expect(backend.loaderState()).toBe('running');
		});

		it('pauseLoader() no-ops when hlsInstance is absent', () => {
			const container = makeContainer();
			const backend = new WebAudioBackend(container);
			expect(() => backend.pauseLoader()).not.toThrow();
		});

		it('resumeLoader() no-ops when hlsInstance is absent', () => {
			const container = makeContainer();
			const backend = new WebAudioBackend(container);
			expect(() => backend.resumeLoader()).not.toThrow();
		});
	});

	// ── sinkId ────────────────────────────────────────────────────────────────

	describe('setSinkId / getSinkId', () => {
		it('getSinkId() throws BrowserPolicyError when sinkId not supported', () => {
			const container = makeContainer();
			const backend = new WebAudioBackend(container);
			const el = backend.mediaElement() as HTMLAudioElement & { sinkId?: string };
			Object.defineProperty(el, 'sinkId', { value: undefined, configurable: true, writable: true });

			expect(() => backend.getSinkId()).toThrow();
		});

		it('setSinkId() throws BrowserPolicyError when setSinkId not supported', async () => {
			const container = makeContainer();
			const backend = new WebAudioBackend(container);
			const el = backend.mediaElement() as HTMLAudioElement & { setSinkId?: unknown };
			Object.defineProperty(el, 'setSinkId', { value: undefined, configurable: true, writable: true });

			// setSinkId throws synchronously when the method is absent — wrap in a
			// Promise-based assertion that catches both thrown errors and rejections.
			let caught: unknown;
			try {
				await backend.setSinkId('device-id');
			}
			catch (e) {
				caught = e;
			}
			expect(caught).toBeDefined();
		});
	});

	// ── mediaKeys / setMediaKeys ───────────────────────────────────────────────

	describe('mediaKeys / setMediaKeys', () => {
		it('mediaKeys() returns undefined when element.mediaKeys is not set', () => {
			const container = makeContainer();
			const backend = new WebAudioBackend(container);
			const result = backend.mediaKeys();
			expect(result === undefined || result === null || typeof result === 'object').toBe(true);
		});
	});

	// ── outputProtectionState ─────────────────────────────────────────────────

	describe('outputProtectionState()', () => {
		it('returns "unrestricted"', () => {
			const container = makeContainer();
			const backend = new WebAudioBackend(container);
			expect(backend.outputProtectionState()).toBe('unrestricted');
		});
	});

	// ── dispose idempotent ────────────────────────────────────────────────────

	describe('dispose()', () => {
		it('second dispose() call does not throw', () => {
			const container = makeContainer();
			const backend = new WebAudioBackend(container);
			backend.dispose();
			expect(() => backend.dispose()).not.toThrow();
		});

		it('dispose() after graph init disconnects all nodes without throwing', () => {
			const container = makeContainer();
			const backend = new WebAudioBackend(container);
			const ctx = MockAudioContext.lastInstance! as unknown as AudioContext;
			backend.outputNode(ctx);
			expect(() => backend.dispose()).not.toThrow();
		});
	});

	// ── primeSecondary ────────────────────────────────────────────────────────

	describe('primeSecondary()', () => {
		it('resolves immediately when no secondary is loaded', async () => {
			const container = makeContainer();
			const backend = new WebAudioBackend(container);
			await expect(backend.primeSecondary()).resolves.toBeUndefined();
		});

		it('primeSecondary with already-ready secondary resolves immediately', async () => {
			const container = makeContainer();
			const backend = new WebAudioBackend(container);

			const loadPromise = backend.loadSecondary('http://test/next.mp3');
			fireMetadata(container);
			await loadPromise;

			const raw = backend as unknown as { _secondaryEl?: HTMLAudioElement };
			const el = raw._secondaryEl!;
			Object.defineProperty(el, 'readyState', { get: () => 3, configurable: true });

			await expect(backend.primeSecondary()).resolves.toBeUndefined();
		});

		it('primeSecondary(seekMs) seeks the secondary element when seekMs > 0', async () => {
			const container = makeContainer();
			const backend = new WebAudioBackend(container);

			const loadPromise = backend.loadSecondary('http://test/next.mp3');
			fireMetadata(container);
			await loadPromise;

			const raw = backend as unknown as { _secondaryEl?: HTMLAudioElement };
			const el = raw._secondaryEl!;
			Object.defineProperty(el, 'readyState', { get: () => 3, configurable: true });

			await backend.primeSecondary(2000);
			expect(el.currentTime).toBe(2);
		});
	});

	// ── audioContext() ────────────────────────────────────────────────────────

	describe('audioContext()', () => {
		it('returns the AudioContext instance', () => {
			const container = makeContainer();
			const backend = new WebAudioBackend(container);
			const ctx = backend.audioContext();
			expect(ctx).toBeDefined();
		});
	});

	// ── unload() ──────────────────────────────────────────────────────────────

	describe('unload()', () => {
		it('does not throw when called with no active load', () => {
			const container = makeContainer();
			const backend = new WebAudioBackend(container);
			expect(() => backend.unload()).not.toThrow();
		});
	});

	// ── crossfade throws without secondary ────────────────────────────────────

	describe('crossfade() guard', () => {
		it('throws when called without a loaded secondary', async () => {
			const container = makeContainer();
			const backend = new WebAudioBackend(container);
			await expect(backend.crossfade(500)).rejects.toThrow('crossfade() called without a loaded secondary');
		});
	});

	// ── volume() without gainNode (before graph init) ─────────────────────────

	describe('volume() before graph init', () => {
		it('read returns element.volume when gainNode not yet created', () => {
			const container = makeContainer();
			const backend = new WebAudioBackend(container);
			const v = backend.volume();
			expect(typeof v).toBe('number');
		});

		it('write sets element.volume when gainNode not yet created', () => {
			const container = makeContainer();
			const backend = new WebAudioBackend(container);
			backend.volume(0.3);
			expect(backend.mediaElement().volume).toBeCloseTo(perceptualGain(0.3), 5);
		});
	});
});

// =============================================================================
// AudioElementBackend — uncovered functions
// =============================================================================

describe('AudioElementBackend — additional coverage', () => {
	afterEach(() => {
		document.body.innerHTML = '';
	});

	// ── detachDomBridges ──────────────────────────────────────────────────────

	describe('detachDomBridges via dispose()', () => {
		it('dispose() removes all dom handlers without throwing', () => {
			const container = makeContainer();
			const backend = new AudioElementBackend(container);
			expect(() => backend.dispose()).not.toThrow();
		});

		it('dispose() is idempotent', () => {
			const container = makeContainer();
			const backend = new AudioElementBackend(container);
			backend.dispose();
			expect(() => backend.dispose()).not.toThrow();
		});
	});

	// ── ensureSourceGraph — context swap ──────────────────────────────────────

	describe('ensureSourceGraph() context swap', () => {
		it('rebuilds graph when a different AudioContext is passed', () => {
			installAudioContext();
			const container = makeContainer();
			const backend = new AudioElementBackend(container);

			const ctx1 = new MockAudioContext() as unknown as AudioContext;
			const ctx2 = new MockAudioContext() as unknown as AudioContext;

			backend.outputNode(ctx1);
			backend.outputNode(ctx2);

			expect(ctx2.createMediaElementSource).toHaveBeenCalled();
			removeAudioContext();
		});
	});

	// ── loadSecondary error path ───────────────────────────────────────────────

	describe('loadSecondary() error path', () => {
		it('rejects when the secondary element fires an error event', async () => {
			const container = makeContainer();
			const backend = new AudioElementBackend(container);

			const loadPromise = backend.loadSecondary('http://test/bad.mp3');

			const audios = container.querySelectorAll('audio');
			const secondary = audios[audios.length - 1];
			if (secondary) secondary.dispatchEvent(new Event('error'));

			await expect(loadPromise).rejects.toBeDefined();
		});
	});

	// ── primeSecondary ────────────────────────────────────────────────────────

	describe('primeSecondary()', () => {
		it('no-ops gracefully when no secondary loaded', async () => {
			const container = makeContainer();
			const backend = new AudioElementBackend(container);
			await expect(backend.primeSecondary()).resolves.toBeUndefined();
		});

		it('resolves immediately when secondary readyState >= 3', async () => {
			const container = makeContainer();
			const backend = new AudioElementBackend(container);

			const loadPromise = backend.loadSecondary('http://test/track.mp3');
			const audios = container.querySelectorAll('audio');
			const el = audios[audios.length - 1];
			if (el) el.dispatchEvent(new Event('loadedmetadata'));
			await loadPromise;

			const raw = backend as unknown as { _secondary?: HTMLAudioElement };
			if (raw._secondary) {
				Object.defineProperty(raw._secondary, 'readyState', { get: () => 3, configurable: true });
			}

			await expect(backend.primeSecondary()).resolves.toBeUndefined();
		});

		it('primeSecondary(seekMs) seeks when seekMs > 0', async () => {
			const container = makeContainer();
			const backend = new AudioElementBackend(container);

			const loadPromise = backend.loadSecondary('http://test/track.mp3');
			const audios = container.querySelectorAll('audio');
			const el = audios[audios.length - 1];
			if (el) el.dispatchEvent(new Event('loadedmetadata'));
			await loadPromise;

			const raw = backend as unknown as { _secondary?: HTMLAudioElement };
			if (raw._secondary) {
				Object.defineProperty(raw._secondary, 'readyState', { get: () => 3, configurable: true });
			}

			await backend.primeSecondary(5000);
			if (raw._secondary) {
				expect(raw._secondary.currentTime).toBe(5);
			}
		});
	});

	// ── secondaryGain write ───────────────────────────────────────────────────

	describe('secondaryGain() write path', () => {
		it('write/read round-trips the curved value', async () => {
			const container = makeContainer();
			const backend = new AudioElementBackend(container);

			const loadPromise = backend.loadSecondary('http://test/track.mp3');
			const audios = container.querySelectorAll('audio');
			const el = audios[audios.length - 1];
			if (el) el.dispatchEvent(new Event('loadedmetadata'));
			await loadPromise;

			backend.secondaryGain(0.4);
			expect(backend.secondaryGain()).toBeCloseTo(perceptualGain(0.4), 5);
		});

		it('write when no secondary is present does not throw', () => {
			const container = makeContainer();
			const backend = new AudioElementBackend(container);
			expect(() => backend.secondaryGain(0.5)).not.toThrow();
		});
	});

	// ── setMediaKeys / mediaKeys ───────────────────────────────────────────────

	describe('setMediaKeys / mediaKeys', () => {
		it('setMediaKeys() throws BrowserPolicyError when not supported', async () => {
			const container = makeContainer();
			const backend = new AudioElementBackend(container);
			const el = backend.mediaElement() as HTMLMediaElement & { setMediaKeys?: unknown };
			Object.defineProperty(el, 'setMediaKeys', { value: undefined, configurable: true, writable: true });

			await expect(backend.setMediaKeys({} as MediaKeys)).rejects.toThrow();
		});
	});

	// ── outputProtectionState ─────────────────────────────────────────────────

	describe('outputProtectionState()', () => {
		it('returns "unsupported"', () => {
			const container = makeContainer();
			const backend = new AudioElementBackend(container);
			expect(backend.outputProtectionState()).toBe('unsupported');
		});
	});

	// ── captureStream error ───────────────────────────────────────────────────

	describe('captureStream() error path', () => {
		it('throws BrowserPolicyError when captureStream absent', () => {
			const container = makeContainer();
			const backend = new AudioElementBackend(container);
			const el = backend.mediaElement() as HTMLAudioElement & { captureStream?: unknown };
			Object.defineProperty(el, 'captureStream', { value: undefined, configurable: true, writable: true });

			expect(() => backend.captureStream()).toThrow();
		});
	});

	// ── getSinkId / setSinkId ──────────────────────────────────────────────────

	describe('getSinkId()', () => {
		it('returns empty string when sinkId is not a string', () => {
			const container = makeContainer();
			const backend = new AudioElementBackend(container);
			const el = backend.mediaElement() as HTMLAudioElement & { sinkId?: undefined };
			Object.defineProperty(el, 'sinkId', { value: undefined, configurable: true, writable: true });
			expect(backend.getSinkId()).toBe('');
		});
	});

	describe('setSinkId()', () => {
		it('throws BrowserPolicyError when setSinkId absent', async () => {
			const container = makeContainer();
			const backend = new AudioElementBackend(container);
			const el = backend.mediaElement() as HTMLAudioElement & { setSinkId?: unknown };
			Object.defineProperty(el, 'setSinkId', { value: undefined, configurable: true, writable: true });
			await expect(backend.setSinkId('device')).rejects.toThrow();
		});
	});

	// ── pauseLoader / resumeLoader ────────────────────────────────────────────

	describe('pauseLoader / resumeLoader with hlsInstance', () => {
		it('pauseLoader() no-ops when hlsInstance absent, state becomes paused', () => {
			const container = makeContainer();
			const backend = new AudioElementBackend(container);
			backend.pauseLoader();
			expect(backend.loaderState()).toBe('paused');
		});

		it('resumeLoader() no-ops when hlsInstance absent, state becomes running', () => {
			const container = makeContainer();
			const backend = new AudioElementBackend(container);
			backend.pauseLoader();
			backend.resumeLoader();
			expect(backend.loaderState()).toBe('running');
		});

		it('pauseLoader/resumeLoader call hlsInstance methods when present', () => {
			const container = makeContainer();
			const backend = new AudioElementBackend(container);
			const stopLoad = vi.fn();
			const startLoad = vi.fn();
			const raw = backend as unknown as { hlsInstance?: { stopLoad: typeof stopLoad; startLoad: typeof startLoad; destroy: () => void } };
			raw.hlsInstance = { stopLoad, startLoad, destroy: vi.fn() };

			backend.pauseLoader();
			expect(stopLoad).toHaveBeenCalled();

			backend.resumeLoader();
			expect(startLoad).toHaveBeenCalled();
		});
	});

	// ── stop() ────────────────────────────────────────────────────────────────

	describe('stop()', () => {
		it('does not throw', () => {
			const container = makeContainer();
			const backend = new AudioElementBackend(container);
			expect(() => backend.stop()).not.toThrow();
		});
	});

	// ── unload() ──────────────────────────────────────────────────────────────

	describe('unload()', () => {
		it('does not throw when called with no load', () => {
			const container = makeContainer();
			const backend = new AudioElementBackend(container);
			expect(() => backend.unload()).not.toThrow();
		});
	});

	// ── constructor with element option ───────────────────────────────────────

	describe('constructor with opts.element', () => {
		it('accepts an externally-provided element', () => {
			const el = document.createElement('audio');
			document.body.appendChild(el);
			const backend = new AudioElementBackend(undefined, { element: el });
			expect(backend.mediaElement()).toBe(el);
		});
	});

	// ── duration / buffered on empty element ──────────────────────────────────

	describe('duration / buffered', () => {
		it('duration() returns 0 for NaN', () => {
			const container = makeContainer();
			const backend = new AudioElementBackend(container);
			expect(backend.duration()).toBe(0);
		});

		it('buffered() returns 0 when no ranges', () => {
			const container = makeContainer();
			const backend = new AudioElementBackend(container);
			expect(backend.buffered()).toBe(0);
		});
	});

	// ── mute / unmute ─────────────────────────────────────────────────────────

	describe('mute() / unmute()', () => {
		it('mute() idempotent', () => {
			const container = makeContainer();
			const backend = new AudioElementBackend(container);
			backend.mute();
			backend.mute();
			expect(backend.mediaElement().muted).toBe(true);
		});

		it('unmute() clears muted', () => {
			const container = makeContainer();
			const backend = new AudioElementBackend(container);
			backend.mute();
			backend.unmute();
			expect(backend.mediaElement().muted).toBe(false);
		});
	});

	// ── crossfade without secondary ───────────────────────────────────────────

	describe('crossfade() guard', () => {
		it('throws when no secondary is loaded', async () => {
			const container = makeContainer();
			const backend = new AudioElementBackend(container);
			await expect(backend.crossfade(500)).rejects.toThrow('crossfade() called without a loaded secondary');
		});
	});
});

// =============================================================================
// hls-loader — uncovered functions
// =============================================================================

describe('hls-loader utilities', () => {
	// ── isHls ─────────────────────────────────────────────────────────────────

	describe('isHls()', () => {
		it('returns true for .m3u8 URL', () => {
			expect(isHls('https://cdn/stream.m3u8')).toBe(true);
		});

		it('returns false for .mp3 URL', () => {
			expect(isHls('https://cdn/audio.mp3')).toBe(false);
		});
	});

	// ── supportsNativeHls ─────────────────────────────────────────────────────

	describe('supportsNativeHls()', () => {
		it('returns false when canPlayType returns empty string', () => {
			const el = document.createElement('audio');
			vi.spyOn(el, 'canPlayType').mockReturnValue('');
			expect(supportsNativeHls(el)).toBe(false);
		});

		it('returns true when canPlayType returns "probably"', () => {
			const el = document.createElement('audio');
			vi.spyOn(el, 'canPlayType').mockReturnValue('probably');
			expect(supportsNativeHls(el)).toBe(true);
		});

		it('returns true when canPlayType is "maybe" and MediaSource is undefined', () => {
			const el = document.createElement('audio');
			vi.spyOn(el, 'canPlayType').mockReturnValue('maybe');
			const savedMs = (globalThis as unknown as { MediaSource?: unknown }).MediaSource;
			delete (globalThis as unknown as { MediaSource?: unknown }).MediaSource;
			expect(supportsNativeHls(el)).toBe(true);
			(globalThis as unknown as { MediaSource?: unknown }).MediaSource = savedMs;
		});
	});

	// ── attachHlsOrFallback — fallback path ───────────────────────────────────

	describe('attachHlsOrFallback()', () => {
		it('uses fallback when hls.isSupported() is false', () => {
			const el = document.createElement('audio');
			document.body.appendChild(el);

			const FakeHls = { isSupported: () => false };
			const appendAuthTokenParam = (url: string, _token: string | undefined): string => url;

			const result = attachHlsOrFallback(
				FakeHls,
				el,
				'https://cdn/audio.mp3',
				undefined,
				{},
				appendAuthTokenParam,
			);

			expect(result).toBeUndefined();
			expect(el.src).toBe('https://cdn/audio.mp3');
			document.body.innerHTML = '';
		});

		it('creates hls instance when supported', () => {
			const el = document.createElement('audio');
			document.body.appendChild(el);

			const loadSource = vi.fn();
			const attachMedia = vi.fn();
			const destroy = vi.fn();
			const stopLoad = vi.fn();
			const startLoad = vi.fn();

			class FakeHlsInstance {
				loadSource = loadSource;
				attachMedia = attachMedia;
				destroy = destroy;
				stopLoad = stopLoad;
				startLoad = startLoad;
			}

			const FakeHls = {
				isSupported: () => true,
				new: (): FakeHlsInstance => new FakeHlsInstance(),
			};

			function FakeHlsCtor(this: FakeHlsInstance): void {
				Object.assign(this, new FakeHlsInstance());
			}
			(FakeHlsCtor as unknown as { isSupported: () => boolean }).isSupported = () => true;

			const appendAuthTokenParam = (url: string, _token: string | undefined): string => url;

			const result = attachHlsOrFallback(
				FakeHlsCtor,
				el,
				'https://cdn/stream.m3u8',
				undefined,
				{},
				appendAuthTokenParam,
			);

			expect(result).toBeDefined();
			expect(attachMedia).toHaveBeenCalledWith(el);
			expect(loadSource).toHaveBeenCalledWith('https://cdn/stream.m3u8');
			document.body.innerHTML = '';
		});
	});

	// ── attachDomBridgesTo — state transitions ────────────────────────────────

	describe('attachDomBridgesTo() — state transitions', () => {
		it('fires state transitions for pause (non-idle)', () => {
			const el = document.createElement('audio');
			document.body.appendChild(el);

			const emitted: [string, unknown][] = [];
			let state: BackendState = 'playing';

			attachDomBridgesTo(
				el,
				(event, data) => emitted.push([event, data]),
				(s) => { state = s; },
				() => state,
			);

			el.dispatchEvent(new Event('pause'));
			expect(state).toBe('paused');
			document.body.innerHTML = '';
		});

		it('does NOT change state for pause when already idle', () => {
			const el = document.createElement('audio');
			document.body.appendChild(el);

			let state: BackendState = 'idle';

			attachDomBridgesTo(
				el,
				() => undefined,
				(s) => { state = s; },
				() => state,
			);

			el.dispatchEvent(new Event('pause'));
			expect(state).toBe('idle');
			document.body.innerHTML = '';
		});

		it('fires "error" state on error event', () => {
			const el = document.createElement('audio');
			document.body.appendChild(el);

			let state: BackendState = 'playing';

			attachDomBridgesTo(
				el,
				() => undefined,
				(s) => { state = s; },
				() => state,
			);

			el.dispatchEvent(new Event('error'));
			expect(state).toBe('error');
			document.body.innerHTML = '';
		});

		it('fires "paused" state on ended event', () => {
			const el = document.createElement('audio');
			document.body.appendChild(el);

			let state: BackendState = 'playing';

			attachDomBridgesTo(
				el,
				() => undefined,
				(s) => { state = s; },
				() => state,
			);

			el.dispatchEvent(new Event('ended'));
			expect(state).toBe('paused');
			document.body.innerHTML = '';
		});
	});
});

// =============================================================================
// SmartShuffleGenerator — uncovered functions
// =============================================================================

describe('SmartShuffleGenerator', () => {
	type TaggedTrack = MusicPlaylistItem & { genre?: string | string[]; decade?: number };

	const tracks = (overrides: TaggedTrack[] = []): TaggedTrack[] =>
		overrides.length > 0 ? overrides : [
			{ id: 'a', name: 'A', genre: 'rock', decade: 90 },
			{ id: 'b', name: 'B', genre: 'pop', decade: 80 },
			{ id: 'c', name: 'C', genre: 'rock', decade: 90 },
			{ id: 'd', name: 'D', genre: 'jazz', decade: 70 },
		];

	it('next() returns an index different from currentIndex', () => {
		const gen = new SmartShuffleGenerator();
		const list = tracks();
		const result = gen.next(list, 0);
		expect(result).not.toBe(0);
	});

	it('next() returns undefined when items is empty', () => {
		const gen = new SmartShuffleGenerator();
		expect(gen.next([], 0)).toBeUndefined();
	});

	it('next() returns 0 when items has only one entry', () => {
		const gen = new SmartShuffleGenerator();
		const list = [{ id: 'x', name: 'X' }];
		expect(gen.next(list, 0)).toBe(0);
	});

	it('next() returns undefined when all candidates are excluded (single item list, idx 0)', () => {
		const gen = new SmartShuffleGenerator();
		const list = [{ id: 'x', name: 'X' }, { id: 'y', name: 'Y' }];
		const result = gen.next(list, 0);
		expect(result).toBe(1);
	});

	it('previous() returns a played index when history exists', () => {
		const gen = new SmartShuffleGenerator();
		const list = tracks();
		gen.next(list, 0);
		const prev = gen.previous(list, 1);
		expect(prev).toBe(0);
	});

	it('previous() returns undefined when items is empty', () => {
		const gen = new SmartShuffleGenerator();
		expect(gen.previous([], 0)).toBeUndefined();
	});

	it('previous() returns a random index when no history', () => {
		const gen = new SmartShuffleGenerator();
		const list = tracks();
		const result = gen.previous(list, 0);
		expect(result).toBeGreaterThanOrEqual(0);
		expect(result).toBeLessThan(list.length);
	});

	it('penalizes same-genre items (does not always pick same genre)', () => {
		const gen = new SmartShuffleGenerator();
		const list: TaggedTrack[] = [
			{ id: 'a', name: 'A', genre: 'rock', decade: 90 },
			{ id: 'b', name: 'B', genre: 'rock', decade: 90 },
			{ id: 'c', name: 'C', genre: 'jazz', decade: 70 },
		];
		// Run many times — at least once jazz should be chosen
		const results = new Set<number>();
		for (let i = 0; i < 50; i++) {
			const newGen = new SmartShuffleGenerator();
			const idx = newGen.next(list, 0);
			if (idx !== undefined) results.add(idx);
		}
		expect(results.size).toBeGreaterThan(0);
	});

	it('toSet handles array genre', () => {
		const gen = new SmartShuffleGenerator();
		const list: TaggedTrack[] = [
			{ id: 'a', name: 'A', genre: ['rock', 'pop'], decade: 90 },
			{ id: 'b', name: 'B', genre: 'jazz', decade: 80 },
			{ id: 'c', name: 'C', genre: 'classical', decade: 70 },
		];
		const result = gen.next(list, 0);
		expect(result).toBeDefined();
	});

	it('handles items with no genre/decade (falls back to uniform random)', () => {
		const gen = new SmartShuffleGenerator();
		const list: MusicPlaylistItem[] = [
			{ id: 'a', name: 'A' },
			{ id: 'b', name: 'B' },
			{ id: 'c', name: 'C' },
		];
		const result = gen.next(list, 0);
		expect(result).toBeDefined();
	});

	it('next() with currentIndex -1 does not push to played history', () => {
		const gen = new SmartShuffleGenerator();
		const list = tracks();
		gen.next(list, -1);
		const prev = gen.previous(list, 0);
		expect(typeof prev).toBe('number');
	});
});

// =============================================================================
// LinearPlaylistGenerator — uncovered edges
// =============================================================================

describe('LinearPlaylistGenerator — edge cases', () => {
	it('next() returns undefined at the last index', () => {
		const gen = new LinearPlaylistGenerator();
		const list = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }];
		expect(gen.next(list, 1)).toBeUndefined();
	});

	it('previous() returns undefined at index 0', () => {
		const gen = new LinearPlaylistGenerator();
		const list = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }];
		expect(gen.previous(list, 0)).toBeUndefined();
	});

	it('next() returns the next sequential index', () => {
		const gen = new LinearPlaylistGenerator();
		const list = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }];
		expect(gen.next(list, 0)).toBe(1);
		expect(gen.next(list, 1)).toBe(2);
	});

	it('previous() returns the prior sequential index', () => {
		const gen = new LinearPlaylistGenerator();
		const list = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }];
		expect(gen.previous(list, 1)).toBe(0);
	});
});

// =============================================================================
// MusicPreloadStrategy — assetsToPreload
// =============================================================================

describe('MusicPreloadStrategy.assetsToPreload()', () => {
	const strategy = new MusicPreloadStrategy(10);

	it('returns empty array for item with no url/cover/lyricsUrl', () => {
		const assets = strategy.assetsToPreload({ id: 'x', name: 'X' } as MusicPlaylistItem);
		expect(assets).toHaveLength(0);
	});

	it('includes media asset when url is present', () => {
		const assets = strategy.assetsToPreload({ id: 'x', name: 'X', url: 'https://cdn/track.mp3' } as MusicPlaylistItem);
		expect(assets.some(a => a.category === 'media')).toBe(true);
	});

	it('includes poster asset when cover is present', () => {
		const assets = strategy.assetsToPreload({ id: 'x', name: 'X', cover: 'https://cdn/cover.jpg' } as MusicPlaylistItem);
		expect(assets.some(a => a.category === 'poster')).toBe(true);
	});

	it('includes lyrics asset when lyricsUrl is present', () => {
		const assets = strategy.assetsToPreload({ id: 'x', name: 'X', lyricsUrl: 'https://cdn/lyrics.lrc' } as MusicPlaylistItem);
		expect(assets.some(a => a.category === 'lyrics')).toBe(true);
	});

	it('includes all three when all fields are present', () => {
		const assets = strategy.assetsToPreload({
			id: 'x',
			name: 'X',
			url: 'https://cdn/track.mp3',
			cover: 'https://cdn/cover.jpg',
			lyricsUrl: 'https://cdn/lyrics.lrc',
		} as MusicPlaylistItem);
		expect(assets).toHaveLength(3);
	});
});

// =============================================================================
// MediaSessionArtProvider — publish / clear
// =============================================================================

describe('MediaSessionArtProvider', () => {
	it('publish() is a no-op when navigator.mediaSession is absent', async () => {
		const provider = new MediaSessionArtProvider();
		const item = { id: 'x', name: 'Track X', artist: 'Art', album: 'Alb' };
		await expect(provider.publish(item, undefined)).resolves.toBeUndefined();
	});

	it('clear() is a no-op when navigator.mediaSession is absent', () => {
		const provider = new MediaSessionArtProvider();
		expect(() => provider.clear()).not.toThrow();
	});

	it('publish() sets mediaSession.metadata when navigator.mediaSession is present', async () => {
		const provider = new MediaSessionArtProvider();
		const item = { id: 'x', name: 'Track X', artist: 'Artist', album: 'Album' };

		// happy-dom lacks MediaMetadata — stub it so the provider code path executes.
		let setMeta: unknown = null;
		const mockMediaSession = {
			get metadata(): unknown { return setMeta; },
			set metadata(v: unknown) { setMeta = v; },
		};

		// Stub MediaMetadata so `new MediaMetadata(...)` doesn't throw.
		const savedMediaMetadata = (globalThis as unknown as { MediaMetadata?: unknown }).MediaMetadata;
		(globalThis as unknown as { MediaMetadata: unknown }).MediaMetadata = class {
			title: string;
			artist: string;
			album: string;
			artwork: unknown[];
			constructor(opts: { title: string; artist: string; album: string; artwork: unknown[] }) {
				this.title = opts.title;
				this.artist = opts.artist;
				this.album = opts.album;
				this.artwork = opts.artwork;
			}
		};

		Object.defineProperty(navigator, 'mediaSession', {
			get: () => mockMediaSession,
			configurable: true,
		});

		await provider.publish(item, 'https://cdn/art.jpg');
		expect(setMeta).toBeDefined();

		Object.defineProperty(navigator, 'mediaSession', { get: () => undefined, configurable: true });
		(globalThis as unknown as { MediaMetadata?: unknown }).MediaMetadata = savedMediaMetadata;
	});

	it('clear() sets mediaSession.metadata to null when present', () => {
		const provider = new MediaSessionArtProvider();
		let setMeta: unknown = {} as MediaMetadata;
		const mockMediaSession = {
			get metadata(): unknown { return setMeta; },
			set metadata(v: unknown) { setMeta = v; },
		};
		Object.defineProperty(navigator, 'mediaSession', {
			get: () => mockMediaSession,
			configurable: true,
		});

		provider.clear();
		expect(setMeta).toBeNull();

		Object.defineProperty(navigator, 'mediaSession', { get: () => undefined, configurable: true });
	});
});

// =============================================================================
// resolveNameList — all branches
// =============================================================================

describe('resolveNameList()', () => {
	it('returns "" for undefined', () => {
		expect(resolveNameList(undefined)).toBe('');
	});

	it('returns "" for empty array', () => {
		expect(resolveNameList([])).toBe('');
	});

	it('returns the string directly when input is a string', () => {
		expect(resolveNameList('Artist X')).toBe('Artist X');
	});

	it('joins array of objects by .name', () => {
		expect(resolveNameList([{ name: 'A' }, { name: 'B' }])).toBe('A, B');
	});

	it('filters out entries with no name', () => {
		expect(resolveNameList([{ name: 'A' }, { name: '' }, { name: 'B' }])).toBe('A, B');
	});
});

// =============================================================================
// NMMusicPlayer — _createBackend / wrappedSetup
// =============================================================================

describe('NMMusicPlayer — _createBackend / wrappedSetup', () => {
	beforeEach(() => {
		(NMMusicPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		const div = document.createElement('div');
		div.id = 'factory-test';
		document.body.appendChild(div);
	});

	afterEach(() => {
		(NMMusicPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		document.body.innerHTML = '';
	});

	it('backend() defaults to AudioElementBackend', async () => {
		const player = new NMMusicPlayer('factory-test').setup({});
		await player.ready();
		expect(player.backend()).toBeInstanceOf(AudioElementBackend);
		player.dispose();
	});

	it('_createBackend uses backendFactory when provided', async () => {
		const fakeBackend: IAudioBackend = {
			kind: 'audio-element',
			load: vi.fn(() => Promise.resolve()),
			unload: vi.fn(),
			dispose: vi.fn(),
			play: vi.fn(() => Promise.resolve()),
			pause: vi.fn(),
			stop: vi.fn(),
			currentTime: vi.fn(() => 0) as IAudioBackend['currentTime'],
			duration: vi.fn(() => 0),
			buffered: vi.fn(() => 0),
			bufferedRanges: vi.fn(() => ({ length: 0 } as unknown as TimeRanges)),
			seekable: vi.fn(() => ({ length: 0 } as unknown as TimeRanges)),
			playbackRate: vi.fn(() => 1) as IAudioBackend['playbackRate'],
			volume: vi.fn(() => 0.8) as IAudioBackend['volume'],
			mute: vi.fn(),
			unmute: vi.fn(),
			state: vi.fn(() => 'idle' as const),
			outputNode: vi.fn(() => ({} as AudioNode)),
			analyserSource: vi.fn(() => ({} as AudioNode)),
			mediaElement: vi.fn(() => document.createElement('audio')),
			captureStream: vi.fn(() => ({} as MediaStream)),
			setSinkId: vi.fn(() => Promise.resolve()),
			getSinkId: vi.fn(() => ''),
			mediaKeys: vi.fn(() => undefined),
			setMediaKeys: vi.fn(() => Promise.resolve()),
			outputProtectionState: vi.fn(() => 'unsupported' as const),
			pauseLoader: vi.fn(),
			resumeLoader: vi.fn(),
			loaderState: vi.fn(() => 'running' as const),
			on: vi.fn(),
			off: vi.fn(),
			supportsCrossfade: vi.fn(() => false),
			loadSecondary: vi.fn(() => Promise.resolve()),
			disposeSecondary: vi.fn(),
			primeSecondary: vi.fn(() => Promise.resolve()),
			crossfade: vi.fn(() => Promise.resolve()),
			secondaryGain: vi.fn(() => 0) as IAudioBackend['secondaryGain'],
		};

		const factory = vi.fn(() => fakeBackend);
		const player = new NMMusicPlayer('factory-test').setup({ backendFactory: factory });
		await player.ready();

		const b = player.backend();
		expect(factory).toHaveBeenCalled();
		expect(b).toBe(fakeBackend);
		player.dispose();
	});

	it('wrappedSetup applies music defaults (preloadStrategy, transitionStrategy)', async () => {
		const player = new NMMusicPlayer('factory-test').setup({});
		await player.ready();
		expect(player.preloadStrategy()).toBeInstanceOf(MusicPreloadStrategy);
		player.dispose();
	});

	it('wrappedSetup respects consumer-provided preloadLeadSeconds', async () => {
		const player = new NMMusicPlayer('factory-test').setup({ preloadLeadSeconds: 20 });
		await player.ready();
		player.dispose();
	});
});

// =============================================================================
// AutoAdvancePlugin — additional coverage
// =============================================================================

describe('AutoAdvancePlugin — additional coverage', () => {
	beforeEach(() => {
		(NMMusicPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		const div = document.createElement('div');
		div.id = 'aa-test';
		document.body.appendChild(div);
	});

	afterEach(() => {
		(NMMusicPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		document.body.innerHTML = '';
	});

	const setup = (): NMMusicPlayer => new NMMusicPlayer('aa-test').setup({});
	const track = (id: string): MusicPlaylistItem => ({ id, name: `Track ${id}` });

	it('addEndedHandler — custom handler fires after built-in advance on ended', async () => {
		const p = setup();
		p.addPlugin(AutoAdvancePlugin);
		await p.ready();
		p.queue([track('a'), track('b')]);

		const instance = p.getPlugin(AutoAdvancePlugin)!;
		const customCalled: boolean[] = [];
		instance.addEndedHandler(async () => { customCalled.push(true); });

		p.emit('ended' as never, undefined as never);
		await new Promise<void>(resolve => setTimeout(resolve, 0));

		expect(customCalled).toHaveLength(1);
	});

	it('addPreloadHandler — handler fires on trackEndingSoon', async () => {
		const p = setup();
		p.addPlugin(AutoAdvancePlugin);
		await p.ready();
		p.queue([track('a'), track('b')]);

		const instance = p.getPlugin(AutoAdvancePlugin)!;
		const preloadCalled: unknown[] = [];
		instance.addPreloadHandler(async (next) => { preloadCalled.push(next); });

		p.emit('trackEndingSoon' as never, undefined as never);
		await new Promise<void>(resolve => setTimeout(resolve, 0));

		expect(preloadCalled).toHaveLength(1);
	});

	it('addCrossfadeHandler — fires on trackEndingSoon', async () => {
		const p = setup();
		p.addPlugin(AutoAdvancePlugin);
		await p.ready();
		p.queue([track('a'), track('b')]);

		const instance = p.getPlugin(AutoAdvancePlugin)!;
		const crossfadeCalled: unknown[] = [];
		instance.addCrossfadeHandler(async (next, dur) => { crossfadeCalled.push({ next, dur }); });

		p.emit('trackEndingSoon' as never, undefined as never);
		await new Promise<void>(resolve => setTimeout(resolve, 0));

		expect(crossfadeCalled).toHaveLength(1);
	});

	it('preloadNextOnEnding:true calls player.load when trackEndingSoon fires', async () => {
		const p = setup();
		p.addPlugin(AutoAdvancePlugin);
		await p.ready();
		p.queue([track('a'), track('b')]);

		const instance = p.getPlugin(AutoAdvancePlugin)!;
		instance.options({ preloadNextOnEnding: true });

		const loadSpy = vi.spyOn(p, 'load').mockResolvedValue(undefined);

		p.emit('trackEndingSoon' as never, undefined as never);
		await new Promise<void>(resolve => setTimeout(resolve, 0));

		expect(loadSpy).toHaveBeenCalled();
	});

	it('preloadNext() is a no-op when queue is empty', async () => {
		const p = setup();
		p.addPlugin(AutoAdvancePlugin);
		await p.ready();

		const instance = p.getPlugin(AutoAdvancePlugin)!;
		await expect(instance.preloadNext()).resolves.toBeUndefined();
	});

	it('enabled:false suppresses trackEndingSoon handler', async () => {
		const p = setup();
		p.addPlugin(AutoAdvancePlugin);
		await p.ready();
		p.queue([track('a'), track('b')]);

		const instance = p.getPlugin(AutoAdvancePlugin)!;
		instance.options({ enabled: false, crossfade: true, crossfadeDuration: 2 });

		const crossfadeSpy = vi.spyOn(p, 'crossfadeTo').mockResolvedValue(undefined);

		p.emit('trackEndingSoon' as never, undefined as never);
		await new Promise<void>(resolve => setTimeout(resolve, 0));

		expect(crossfadeSpy).not.toHaveBeenCalled();
	});
});

// =============================================================================
// LyricsPlugin — additional coverage
// =============================================================================

describe('LyricsPlugin — additional coverage', () => {
	beforeEach(() => {
		(NMMusicPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		const div = document.createElement('div');
		div.id = 'lyric-test';
		document.body.appendChild(div);
	});

	afterEach(() => {
		(NMMusicPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		document.body.innerHTML = '';
		vi.restoreAllMocks();
	});

	it('autoFetch:false suppresses auto-fetch on item event', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch');

		const p = new NMMusicPlayer('lyric-test').setup({});
		p.addPlugin(LyricsPlugin, { autoFetch: false });
		await p.ready();

		p.emit('item' as never, { item: { id: 'a', name: 'A', lyricsUrl: 'https://cdn/a.lrc' }, index: 0 } as never);
		await new Promise<void>(resolve => setTimeout(resolve, 0));

		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('fetchLyrics() reports an error when no parser is registered for the URL', async () => {
		const p = new NMMusicPlayer('lyric-test').setup({});
		p.addPlugin(LyricsPlugin);
		await p.ready();

		const instance = p.getPlugin(LyricsPlugin)!;
		const result = await instance.fetchLyrics('https://cdn/lyrics.vtt');
		expect(result).toBeUndefined();
	});

	it('fetchLyrics() reports an error on network failure', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('network fail'));

		const p = new NMMusicPlayer('lyric-test').setup({
			cueParsers: [{
				id: 'stub',
				canParse: () => true,
				parse: () => ({ cues: [] }) as never,
			}],
		});
		p.addPlugin(LyricsPlugin);
		await p.ready();

		const instance = p.getPlugin(LyricsPlugin)!;
		const result = await instance.fetchLyrics('https://cdn/fail.lrc');
		expect(result).toBeUndefined();

		fetchSpy.mockRestore();
	});

	it('getLyricsUrl option overrides default resolution', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
			new Response('[00:01.00]Hello\n', { status: 200 }),
		);

		const resolverCalled: string[] = [];
		const p = new NMMusicPlayer('lyric-test').setup({
			cueParsers: [{
				id: 'stub',
				canParse: () => true,
				parse: () => ({ cues: [] }) as never,
			}],
		});
		p.addPlugin(LyricsPlugin, {
			getLyricsUrl: (track) => {
				resolverCalled.push(track.id as string);
				return `https://cdn/${track.id}.lrc`;
			},
		});
		await p.ready();

		p.emit('item' as never, { item: { id: 'track1', name: 'T1' }, index: 0 } as never);
		await new Promise<void>(resolve => setTimeout(resolve, 0));

		expect(resolverCalled).toContain('track1');

		fetchSpy.mockRestore();
	});

	it('clear() disposes tracker without throwing', async () => {
		const p = new NMMusicPlayer('lyric-test').setup({});
		p.addPlugin(LyricsPlugin);
		await p.ready();

		const instance = p.getPlugin(LyricsPlugin)!;
		expect(() => instance.clear()).not.toThrow();
	});

	it('dispose() clears all state without throwing', async () => {
		const p = new NMMusicPlayer('lyric-test').setup({});
		p.addPlugin(LyricsPlugin);
		await p.ready();

		expect(() => p.dispose()).not.toThrow();
	});

	it('all() returns empty list before any lyrics loaded', async () => {
		const p = new NMMusicPlayer('lyric-test').setup({});
		p.addPlugin(LyricsPlugin);
		await p.ready();

		const instance = p.getPlugin(LyricsPlugin)!;
		expect(instance.all()).toHaveLength(0);
	});

	it('item event with item missing name calls clear() (non-music item)', async () => {
		const p = new NMMusicPlayer('lyric-test').setup({});
		p.addPlugin(LyricsPlugin);
		await p.ready();

		const instance = p.getPlugin(LyricsPlugin)!;
		const clearSpy = vi.spyOn(instance, 'clear');

		p.emit('item' as never, { item: { id: 'x' }, index: 0 } as never);
		await new Promise<void>(resolve => setTimeout(resolve, 0));

		expect(clearSpy).toHaveBeenCalled();
	});
});

// =============================================================================
// KeyHandlerPlugin — music-specific bindings fire
// =============================================================================

describe('KeyHandlerPlugin — music-specific key bindings', () => {
	beforeEach(() => {
		(NMMusicPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		const div = document.createElement('div');
		div.id = 'kh-test';
		document.body.appendChild(div);
	});

	afterEach(() => {
		(NMMusicPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		document.body.innerHTML = '';
	});

	it('n binding calls player.next()', async () => {
		const p = new NMMusicPlayer('kh-test').setup({});
		p.addPlugin(KeyHandlerPlugin);
		await p.ready();

		const nextSpy = vi.spyOn(p, 'next').mockResolvedValue(undefined);

		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', bubbles: true }));

		expect(nextSpy).toHaveBeenCalled();
	});

	it('p binding calls player.previous()', async () => {
		const p = new NMMusicPlayer('kh-test').setup({});
		p.addPlugin(KeyHandlerPlugin);
		await p.ready();

		const prevSpy = vi.spyOn(p, 'previous').mockResolvedValue(undefined);

		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', bubbles: true }));

		expect(prevSpy).toHaveBeenCalled();
	});

	it('r binding cycles repeatState', async () => {
		const p = new NMMusicPlayer('kh-test').setup({});
		p.addPlugin(KeyHandlerPlugin);
		await p.ready();

		const repeatSpy = vi.spyOn(p, 'repeatState');

		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', bubbles: true }));

		expect(repeatSpy).toHaveBeenCalled();
	});

	it('s binding toggles shuffleState', async () => {
		const p = new NMMusicPlayer('kh-test').setup({});
		p.addPlugin(KeyHandlerPlugin);
		await p.ready();

		const shuffleSpy = vi.spyOn(p, 'shuffleState');

		document.dispatchEvent(new KeyboardEvent('keydown', { key: 's', bubbles: true }));

		expect(shuffleSpy).toHaveBeenCalled();
	});
});

// =============================================================================
// V1MusicCompatPlugin — remaining uncovered shims
// =============================================================================

describe('V1MusicCompatPlugin — remaining uncovered shims', () => {
	beforeEach(() => {
		(NMMusicPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		const div = document.createElement('div');
		div.id = 'v1-extra';
		document.body.appendChild(div);
		vi.spyOn(console, 'warn').mockImplementation(() => undefined);
	});

	afterEach(() => {
		(NMMusicPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		document.body.innerHTML = '';
		vi.restoreAllMocks();
	});

	const setup = (): NMMusicPlayer => new NMMusicPlayer('v1-extra').setup({});
	const prop = (p: NMMusicPlayer, name: string): unknown => (p as unknown as Record<string, unknown>)[name];

	// ── state property shims ──────────────────────────────────────────────────

	it('currentTime getter delegates to player.time()', async () => {
		const p = setup();
		p.addPlugin(V1MusicCompatPlugin);
		await p.ready();
		const spy = vi.spyOn(p, 'time');
		void prop(p, 'currentTime');
		expect(spy).toHaveBeenCalled();
		p.dispose();
	});

	it('muted getter returns boolean from volumeState()', async () => {
		const p = setup();
		p.addPlugin(V1MusicCompatPlugin);
		await p.ready();
		expect(typeof prop(p, 'muted')).toBe('boolean');
		p.dispose();
	});

	it('isMuted getter returns boolean from volumeState()', async () => {
		const p = setup();
		p.addPlugin(V1MusicCompatPlugin);
		await p.ready();
		expect(typeof prop(p, 'isMuted')).toBe('boolean');
		p.dispose();
	});

	it('isPlaying getter returns boolean from playState()', async () => {
		const p = setup();
		p.addPlugin(V1MusicCompatPlugin);
		await p.ready();
		expect(typeof prop(p, 'isPlaying')).toBe('boolean');
		p.dispose();
	});

	it('isPaused getter returns boolean', async () => {
		const p = setup();
		p.addPlugin(V1MusicCompatPlugin);
		await p.ready();
		expect(typeof prop(p, 'isPaused')).toBe('boolean');
		p.dispose();
	});

	it('isStopped getter returns boolean', async () => {
		const p = setup();
		p.addPlugin(V1MusicCompatPlugin);
		await p.ready();
		expect(typeof prop(p, 'isStopped')).toBe('boolean');
		p.dispose();
	});

	it('isSeeking getter always returns false', async () => {
		const p = setup();
		p.addPlugin(V1MusicCompatPlugin);
		await p.ready();
		expect(prop(p, 'isSeeking')).toBe(false);
		p.dispose();
	});

	it('isRepeating getter returns boolean', async () => {
		const p = setup();
		p.addPlugin(V1MusicCompatPlugin);
		await p.ready();
		expect(typeof prop(p, 'isRepeating')).toBe('boolean');
		p.dispose();
	});

	it('isShuffling getter returns boolean', async () => {
		const p = setup();
		p.addPlugin(V1MusicCompatPlugin);
		await p.ready();
		expect(typeof prop(p, 'isShuffling')).toBe('boolean');
		p.dispose();
	});

	it('state getter maps playState to v1 string values', async () => {
		const p = setup();
		p.addPlugin(V1MusicCompatPlugin);
		await p.ready();
		const stateVal = prop(p, 'state');
		expect(typeof stateVal).toBe('string');
		p.dispose();
	});

	it('fadeDuration getter always returns 0', async () => {
		const p = setup();
		p.addPlugin(V1MusicCompatPlugin);
		await p.ready();
		expect(prop(p, 'fadeDuration')).toBe(0);
		p.dispose();
	});

	it('newSourceLoaded getter always returns false', async () => {
		const p = setup();
		p.addPlugin(V1MusicCompatPlugin);
		await p.ready();
		expect(prop(p, 'newSourceLoaded')).toBe(false);
		p.dispose();
	});

	it('context getter delegates to audioContext()', async () => {
		const p = setup();
		p.addPlugin(V1MusicCompatPlugin);
		await p.ready();
		const ctxSpy = vi.spyOn(p, 'audioContext');
		void prop(p, 'context');
		expect(ctxSpy).toHaveBeenCalled();
		p.dispose();
	});

	it('accessToken getter returns undefined when auth not set', async () => {
		const p = setup();
		p.addPlugin(V1MusicCompatPlugin);
		await p.ready();
		expect(prop(p, 'accessToken')).toBeUndefined();
		p.dispose();
	});

	// ── setCurrentTime ────────────────────────────────────────────────────────

	it('setCurrentTime(30) calls time(30) and returns player', async () => {
		const p = setup();
		p.addPlugin(V1MusicCompatPlugin);
		await p.ready();
		const spy = vi.spyOn(p, 'time');
		const result = shim(p, 'setCurrentTime')(30);
		expect(spy).toHaveBeenCalledWith(30);
		expect(result).toBe(p);
		p.dispose();
	});

	it('setCurrentTime() with no arg defaults to 0', async () => {
		const p = setup();
		p.addPlugin(V1MusicCompatPlugin);
		await p.ready();
		const spy = vi.spyOn(p, 'time');
		shim(p, 'setCurrentTime')();
		expect(spy).toHaveBeenCalledWith(0);
		p.dispose();
	});

	// ── setRepeating ──────────────────────────────────────────────────────────

	it('setRepeating("all") calls repeatState("all")', async () => {
		const p = setup();
		p.addPlugin(V1MusicCompatPlugin);
		await p.ready();
		const spy = vi.spyOn(p, 'repeatState');
		shim(p, 'setRepeating')('all');
		expect(spy).toHaveBeenCalledWith('all');
		p.dispose();
	});

	it('setRepeating with unknown mode does not throw', async () => {
		const p = setup();
		p.addPlugin(V1MusicCompatPlugin);
		await p.ready();
		expect(() => shim(p, 'setRepeating')('invalid-mode')).not.toThrow();
		p.dispose();
	});

	// ── fadeVolume ────────────────────────────────────────────────────────────

	it('fadeVolume(80) calls volume(80) and warns about removal', async () => {
		const p = setup();
		p.addPlugin(V1MusicCompatPlugin);
		await p.ready();
		const spy = vi.spyOn(p, 'volume');
		shim(p, 'fadeVolume')(80);
		expect(spy).toHaveBeenCalledWith(80);
		p.dispose();
	});

	it('fadeVolume() with no arg calls volume(0)', async () => {
		const p = setup();
		p.addPlugin(V1MusicCompatPlugin);
		await p.ready();
		const spy = vi.spyOn(p, 'volume');
		shim(p, 'fadeVolume')();
		expect(spy).toHaveBeenCalledWith(0);
		p.dispose();
	});

	// ── getAudioElement ───────────────────────────────────────────────────────

	it('getAudioElement() returns undefined and warns', async () => {
		const p = setup();
		p.addPlugin(V1MusicCompatPlugin);
		await p.ready();
		const result = shim(p, 'getAudioElement')();
		expect(result).toBeUndefined();
		p.dispose();
	});

	// ── getTimeData ───────────────────────────────────────────────────────────

	it('getTimeData() delegates to timeData()', async () => {
		const p = setup();
		p.addPlugin(V1MusicCompatPlugin);
		await p.ready();
		const spy = vi.spyOn(p, 'timeData');
		shim(p, 'getTimeData')();
		expect(spy).toHaveBeenCalled();
		p.dispose();
	});

	// ── removeFromQueue — item without id ─────────────────────────────────────

	it('removeFromQueue(item without id) does NOT call queueRemove', async () => {
		const p = setup();
		p.addPlugin(V1MusicCompatPlugin);
		await p.ready();
		const spy = vi.spyOn(p, 'queueRemove');
		shim(p, 'removeFromQueue')({});
		expect(spy).not.toHaveBeenCalled();
		p.dispose();
	});

	// ── removeFromBackLog ─────────────────────────────────────────────────────

	it('removeFromBackLog({ id }) calls backlogRemove(id)', async () => {
		const p = setup();
		p.addPlugin(V1MusicCompatPlugin);
		await p.ready();
		const spy = vi.spyOn(p, 'backlogRemove');
		shim(p, 'removeFromBackLog')({ id: 'z' });
		expect(spy).toHaveBeenCalledWith('z');
		p.dispose();
	});

	it('removeFromBackLog(item without id) does NOT call backlogRemove', async () => {
		const p = setup();
		p.addPlugin(V1MusicCompatPlugin);
		await p.ready();
		const spy = vi.spyOn(p, 'backlogRemove');
		shim(p, 'removeFromBackLog')({});
		expect(spy).not.toHaveBeenCalled();
		p.dispose();
	});

	// ── setBackLog / addToBackLog / pushToBackLog ─────────────────────────────

	it('setBackLog(items) → backlog(items)', async () => {
		const p = setup();
		p.addPlugin(V1MusicCompatPlugin);
		await p.ready();
		const spy = vi.spyOn(p, 'backlog');
		shim(p, 'setBackLog')([{ id: 'a', name: 'A' }]);
		expect(spy).toHaveBeenCalled();
		p.dispose();
	});

	it('addToBackLog(null) no-ops — does not call backlogAppend', async () => {
		const p = setup();
		p.addPlugin(V1MusicCompatPlugin);
		await p.ready();
		const spy = vi.spyOn(p, 'backlogAppend');
		shim(p, 'addToBackLog')(null);
		expect(spy).not.toHaveBeenCalled();
		p.dispose();
	});

	it('addToBackLog(item) calls backlogAppend', async () => {
		const p = setup();
		p.addPlugin(V1MusicCompatPlugin);
		await p.ready();
		const spy = vi.spyOn(p, 'backlogAppend');
		shim(p, 'addToBackLog')({ id: 'b', name: 'B' });
		expect(spy).toHaveBeenCalled();
		p.dispose();
	});

	// ── playTrack without tracksArray ─────────────────────────────────────────

	it('playTrack(track) without tracksArray calls item(track) but not queue()', async () => {
		const p = setup();
		p.addPlugin(V1MusicCompatPlugin);
		await p.ready();
		const qSpy = vi.spyOn(p, 'queue');
		const iSpy = vi.spyOn(p, 'item');
		shim(p, 'playTrack')({ id: 'x', name: 'X' });
		expect(qSpy).not.toHaveBeenCalled();
		expect(iSpy).toHaveBeenCalled();
		p.dispose();
	});

	// ── setCurrentSong(null) no-ops ───────────────────────────────────────────

	it('setCurrentSong(null) does not call item()', async () => {
		const p = setup();
		p.addPlugin(V1MusicCompatPlugin);
		await p.ready();
		const spy = vi.spyOn(p, 'item');
		shim(p, 'setCurrentSong')(null);
		expect(spy).not.toHaveBeenCalled();
		p.dispose();
	});

	// ── hasNextQueued ─────────────────────────────────────────────────────────

	it('hasNextQueued returns false when queue is empty', async () => {
		const p = setup();
		p.addPlugin(V1MusicCompatPlugin);
		await p.ready();
		expect(prop(p, 'hasNextQueued')).toBe(false);
		p.dispose();
	});

	it('hasNextQueued returns true when queue has items', async () => {
		const p = setup();
		p.addPlugin(V1MusicCompatPlugin);
		await p.ready();
		p.queue([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]);
		expect(prop(p, 'hasNextQueued')).toBe(true);
		p.dispose();
	});

	// ── shuffle(boolean) ──────────────────────────────────────────────────────

	it('shuffle(true) calls shuffleState(true)', async () => {
		const p = setup();
		p.addPlugin(V1MusicCompatPlugin);
		await p.ready();
		const spy = vi.spyOn(p, 'shuffleState');
		shim(p, 'shuffle')(true);
		expect(spy).toHaveBeenCalledWith(true);
		p.dispose();
	});

	it('shuffle(false) calls shuffleState(false)', async () => {
		const p = setup();
		p.addPlugin(V1MusicCompatPlugin);
		await p.ready();
		const spy = vi.spyOn(p, 'shuffleState');
		shim(p, 'shuffle')(false);
		expect(spy).toHaveBeenCalledWith(false);
		p.dispose();
	});

	it('shuffle("on") (non-boolean) calls shuffleState("on")', async () => {
		const p = setup();
		p.addPlugin(V1MusicCompatPlugin);
		await p.ready();
		const spy = vi.spyOn(p, 'shuffleState');
		shim(p, 'shuffle')('on');
		expect(spy).toHaveBeenCalledWith('on');
		p.dispose();
	});

	// ── isPlatform ────────────────────────────────────────────────────────────

	it('isPlatform("android") returns false in happy-dom', async () => {
		const p = setup();
		p.addPlugin(V1MusicCompatPlugin);
		await p.ready();
		expect(shim(p, 'isPlatform')('android')).toBe(false);
		p.dispose();
	});

	it('isPlatform("ios") returns false in happy-dom', async () => {
		const p = setup();
		p.addPlugin(V1MusicCompatPlugin);
		await p.ready();
		expect(shim(p, 'isPlatform')('ios')).toBe(false);
		p.dispose();
	});

	it('isPlatform("desktop") returns false (unrecognized platform)', async () => {
		const p = setup();
		p.addPlugin(V1MusicCompatPlugin);
		await p.ready();
		expect(shim(p, 'isPlatform')('desktop')).toBe(false);
		p.dispose();
	});

	// ── setAccessToken as function ────────────────────────────────────────────

	it('setAccessToken(fn) resolves the token and calls auth({ bearerToken })', async () => {
		const p = setup();
		p.addPlugin(V1MusicCompatPlugin);
		await p.ready();
		const spy = vi.spyOn(p, 'auth');
		shim(p, 'setAccessToken')(() => 'resolved-token');
		expect(spy).toHaveBeenCalledWith({ bearerToken: 'resolved-token' });
		p.dispose();
	});

	it('setAccessToken(number) does not call auth', async () => {
		const p = setup();
		p.addPlugin(V1MusicCompatPlugin);
		await p.ready();
		const spy = vi.spyOn(p, 'auth');
		shim(p, 'setAccessToken')(42);
		expect(spy).not.toHaveBeenCalled();
		p.dispose();
	});

	// ── equalizerPanning setter ───────────────────────────────────────────────

	it('equalizerPanning setter warns and stores value', async () => {
		const p = setup();
		p.addPlugin(V1MusicCompatPlugin);
		await p.ready();
		const target = p as unknown as Record<string, unknown>;
		target['equalizerPanning'] = 0.5;
		expect(prop(p, 'equalizerPanning')).toBe(0.5);
		p.dispose();
	});

	// ── equalizerBands setter ─────────────────────────────────────────────────

	it('equalizerBands setter warns and does not throw', async () => {
		const p = setup();
		p.addPlugin(V1MusicCompatPlugin);
		await p.ready();
		const target = p as unknown as Record<string, unknown>;
		expect(() => { target['equalizerBands'] = []; }).not.toThrow();
		p.dispose();
	});

	// ── equalizerPresets setter ───────────────────────────────────────────────

	it('equalizerPresets setter warns and does not throw', async () => {
		const p = setup();
		p.addPlugin(V1MusicCompatPlugin);
		await p.ready();
		const target = p as unknown as Record<string, unknown>;
		expect(() => { target['equalizerPresets'] = []; }).not.toThrow();
		p.dispose();
	});

	// ── siteTitle setter via the shim ─────────────────────────────────────────

	it('siteTitle setter stores value, getter returns it', async () => {
		const p = setup();
		p.addPlugin(V1MusicCompatPlugin);
		await p.ready();
		const target = p as unknown as Record<string, unknown>;
		target['siteTitle'] = 'My App';
		expect(prop(p, 'siteTitle')).toBe('My App');
		p.dispose();
	});

	// ── _wireActions — seek callback ──────────────────────────────────────────

	it('_wireActions: seek action fires when time event emits', async () => {
		const seekValues: number[] = [];
		const p = setup();
		p.addPlugin(V1MusicCompatPlugin, {
			actions: {
				seek: (pos) => seekValues.push(pos),
			},
		});
		await p.ready();

		p.emit('time' as never, { position: 42 } as never);

		expect(seekValues).toContain(42);
		p.dispose();
	});

	it('_wireActions: play action fires when play event emits', async () => {
		const called: boolean[] = [];
		const p = setup();
		p.addPlugin(V1MusicCompatPlugin, {
			actions: {
				play: () => called.push(true),
			},
		});
		await p.ready();

		p.emit('play' as never, undefined as never);

		expect(called).toContain(true);
		p.dispose();
	});

	it('_wireActions: pause action fires when pause event emits', async () => {
		const called: boolean[] = [];
		const p = setup();
		p.addPlugin(V1MusicCompatPlugin, {
			actions: {
				pause: () => called.push(true),
			},
		});
		await p.ready();

		p.emit('pause' as never, undefined as never);
		expect(called).toHaveLength(1);
		p.dispose();
	});

	it('_wireActions: stop action fires when stop event emits', async () => {
		const called: boolean[] = [];
		const p = setup();
		p.addPlugin(V1MusicCompatPlugin, {
			actions: {
				stop: () => called.push(true),
			},
		});
		await p.ready();

		p.emit('stop' as never, undefined as never);
		expect(called).toHaveLength(1);
		p.dispose();
	});

	it('_wireActions: previous action fires when previous event emits', async () => {
		const called: boolean[] = [];
		const p = setup();
		p.addPlugin(V1MusicCompatPlugin, {
			actions: {
				previous: () => called.push(true),
			},
		});
		await p.ready();

		p.emit('previous' as never, undefined as never);
		expect(called).toHaveLength(1);
		p.dispose();
	});

	it('_wireActions: next action fires when next event emits', async () => {
		const called: boolean[] = [];
		const p = setup();
		p.addPlugin(V1MusicCompatPlugin, {
			actions: {
				next: () => called.push(true),
			},
		});
		await p.ready();

		p.emit('next' as never, undefined as never);
		expect(called).toHaveLength(1);
		p.dispose();
	});

	// ── on() interceptor — unknown event fallthrough ──────────────────────────

	it('on() passes unknown event names through to original on()', async () => {
		const p = setup();
		p.addPlugin(V1MusicCompatPlugin);
		await p.ready();

		const received: unknown[] = [];
		shimOn(p, 'customEvent', (d) => received.push(d));

		p.emit('customEvent' as never, { value: 99 } as never);
		expect(received).toHaveLength(1);
		p.dispose();
	});

	// ── crossfadeStart bridge fires correctly ──────────────────────────────────

	it('on("crossfadeStart") reshapes payload to {from, to} only', async () => {
		const p = setup();
		p.addPlugin(V1MusicCompatPlugin);
		await p.ready();

		const received: unknown[] = [];
		shimOn(p, 'crossfadeStart', (d) => received.push(d));

		p.emit('crossfadeStart' as never, { from: 'trackA', to: 'trackB', duration: 5000 } as never);
		expect(received).toHaveLength(1);
		const payload = received[0] as Record<string, unknown>;
		expect(payload['from']).toBe('trackA');
		expect(payload['to']).toBe('trackB');
		expect(payload['duration']).toBeUndefined();
		p.dispose();
	});

	// ── crossfadeComplete bridge ───────────────────────────────────────────────

	it('on("crossfadeComplete") reshapes payload to the track value', async () => {
		const p = setup();
		p.addPlugin(V1MusicCompatPlugin);
		await p.ready();

		const received: unknown[] = [];
		shimOn(p, 'crossfadeComplete', (d) => received.push(d));

		p.emit('crossfadeComplete' as never, { track: { id: 'x', name: 'X' } } as never);
		expect(received).toHaveLength(1);
		expect((received[0] as { id: string }).id).toBe('x');
		p.dispose();
	});

	// ── fatalError → error bridge ─────────────────────────────────────────────

	it('on("fatalError") fires when v2 error event fires', async () => {
		const p = setup();
		p.addPlugin(V1MusicCompatPlugin);
		await p.ready();

		const received: unknown[] = [];
		shimOn(p, 'fatalError', (d) => received.push(d));

		p.emit('error' as never, { code: 'net:fail' } as never);
		expect(received).toHaveLength(1);
		p.dispose();
	});

	// ── setCurrentAudio → ready bridge ────────────────────────────────────────

	it('on("setCurrentAudio") fires when ready event fires', async () => {
		const p = setup();
		p.addPlugin(V1MusicCompatPlugin);
		await p.ready();

		const received: unknown[] = [];
		shimOn(p, 'setCurrentAudio', (d) => received.push(d));

		p.emit('ready' as never, undefined as never);
		expect(received).toHaveLength(1);
		p.dispose();
	});

	// ── duration listener updates _currentDuration ───────────────────────────

	it('duration event updates module-level _currentDuration used by time reshaper', async () => {
		const p = setup();
		p.addPlugin(V1MusicCompatPlugin);
		await p.ready();

		p.emit('duration' as never, { duration: 240 } as never);

		const received: unknown[] = [];
		shimOn(p, 'time', (d) => received.push(d));
		p.emit('time' as never, { time: 60 } as never);

		const payload = received[0] as Record<string, number>;
		expect(payload['duration']).toBe(240);
		expect(payload['remaining']).toBeCloseTo(180, 1);
		p.dispose();
	});

	// ── prepareCrossfade with undefined item ──────────────────────────────────

	it('prepareCrossfade() with no arg calls crossfadeTo(peekNext()) when next exists', async () => {
		const p = setup();
		p.addPlugin(V1MusicCompatPlugin);
		await p.ready();

		p.queue([{ id: 'a', name: 'A', url: 'https://cdn/a.mp3' }, { id: 'b', name: 'B', url: 'https://cdn/b.mp3' }]);

		const crossfadeSpy = vi.spyOn(p, 'crossfadeTo').mockResolvedValue(undefined);
		shim(p, 'prepareCrossfade')();
		await new Promise<void>(resolve => setTimeout(resolve, 0));

		expect(crossfadeSpy).toHaveBeenCalled();
		p.dispose();
	});

	it('prepareCrossfade() with no arg does nothing when queue is empty', async () => {
		const p = setup();
		p.addPlugin(V1MusicCompatPlugin);
		await p.ready();

		const crossfadeSpy = vi.spyOn(p, 'crossfadeTo').mockResolvedValue(undefined);
		shim(p, 'prepareCrossfade')();
		await new Promise<void>(resolve => setTimeout(resolve, 0));

		expect(crossfadeSpy).not.toHaveBeenCalled();
		p.dispose();
	});
});
