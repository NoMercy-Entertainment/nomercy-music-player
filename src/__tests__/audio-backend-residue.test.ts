// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * Audio-backend residue — the paths the crossfade contract / ramp suites leave
 * open on both backends:
 *
 *  - AudioElementBackend's lazy Web Audio tap (ensureSourceGraph, context swap,
 *    lazy crossOrigin upgrade with source reload + position restore)
 *  - guard methods: outputProtectionState, loaderState, pause/resumeLoader
 *  - crossfade() without a loaded secondary throws; primeSecondary() no-ops
 *  - secondaryGain(value) setter form is safe with no secondary allocated
 *  - disposeSecondary() mid-fade safety and dispose() during an in-flight fade
 *  - WebAudioBackend: suspended-context resume on play(), webkit-prefixed
 *    constructor resolution, element reuse from the container, load error path
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { AudioElementBackend } from '../adapters/audio-backend/html5-audio';
import { WebAudioBackend } from '../adapters/audio-backend/web-audio';

// ── Web Audio stubs (established class-based pattern) ─────────────────────────

function makeMockGain(): {
	value: number;
	setTargetAtTime: ReturnType<typeof vi.fn>;
	setValueAtTime: ReturnType<typeof vi.fn>;
	linearRampToValueAtTime: ReturnType<typeof vi.fn>;
	cancelScheduledValues: ReturnType<typeof vi.fn>;
} {
	let level = 1;
	return {
		get value(): number { return level; },
		set value(next: number) { level = next; },
		setTargetAtTime: vi.fn((target: number) => { level = target; }),
		setValueAtTime: vi.fn((target: number) => { level = target; }),
		linearRampToValueAtTime: vi.fn((target: number) => { level = target; }),
		cancelScheduledValues: vi.fn(),
	};
}

class MockGainNode {
	gain = makeMockGain();
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

	createGain = vi.fn(() => new MockGainNode());
	createAnalyser = vi.fn(() => new MockAnalyserNode());
	createMediaElementSource = vi.fn(() => new MockSourceNode());
	resume = vi.fn(() => Promise.resolve());

	constructor() {
		MockAudioContext.lastInstance = this;
	}
}

function installAudioContext(): void {
	(globalThis as any).AudioContext = MockAudioContext;
	MockAudioContext.lastInstance = null;
}

function removeAudioContext(): void {
	delete (globalThis as any).AudioContext;
	delete (globalThis as any).webkitAudioContext;
	MockAudioContext.lastInstance = null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeContainer(): HTMLDivElement {
	const div = document.createElement('div');
	document.body.appendChild(div);
	return div;
}

function stubPlay(element: HTMLAudioElement): void {
	Object.defineProperty(element, 'play', {
		value: vi.fn(() => Promise.resolve()),
		writable: true,
		configurable: true,
	});
}

function fireMetadataOnLast(container: HTMLElement): void {
	const audios = container.querySelectorAll('audio');
	const target = audios[audios.length - 1];
	if (target) {
		target.dispatchEvent(new Event('loadedmetadata'));
	}
}

function fakeTimeRanges(ends: number[]): TimeRanges {
	return {
		length: ends.length,
		start: () => 0,
		end: (idx: number) => ends[idx]!,
	} as unknown as TimeRanges;
}

describe('audio-backend residue', () => {
	afterEach(() => {
		removeAudioContext();
		document.body.innerHTML = '';
	});

	// ── AudioElementBackend — lazy Web Audio tap ─────────────────────────────

	describe('AudioElementBackend graph tap', () => {
		it('outputNode(ctx) wires source → analyser → gain → destination and returns the gain node', () => {
			const container = makeContainer();
			const backend = new AudioElementBackend(container);
			const ctx = new MockAudioContext();

			const output = backend.outputNode(ctx as unknown as AudioContext);

			expect(ctx.createMediaElementSource).toHaveBeenCalledWith(backend.mediaElement());
			const sourceNode = ctx.createMediaElementSource.mock.results[0]!.value as MockSourceNode;
			const analyserNode = ctx.createAnalyser.mock.results[0]!.value as MockAnalyserNode;
			const gainNode = ctx.createGain.mock.results[0]!.value as MockGainNode;

			expect(output).toBe(gainNode);
			expect(sourceNode.connect).toHaveBeenCalledWith(analyserNode);
			expect(analyserNode.connect).toHaveBeenCalledWith(gainNode);
			expect(gainNode.connect).toHaveBeenCalledWith(ctx.destination);
		});

		it('analyserSource(ctx) returns the analyser and reuses the graph for the same context', () => {
			const container = makeContainer();
			const backend = new AudioElementBackend(container);
			const ctx = new MockAudioContext();

			const analyser = backend.analyserSource(ctx as unknown as AudioContext);
			const output = backend.outputNode(ctx as unknown as AudioContext);

			expect(analyser).toBe(ctx.createAnalyser.mock.results[0]!.value);
			expect(output).toBe(ctx.createGain.mock.results[0]!.value);
			expect(ctx.createMediaElementSource).toHaveBeenCalledTimes(1);
		});

		it('swapping to a different context disconnects the old graph and rebuilds', () => {
			const container = makeContainer();
			const backend = new AudioElementBackend(container);
			const firstCtx = new MockAudioContext();
			const secondCtx = new MockAudioContext();

			backend.outputNode(firstCtx as unknown as AudioContext);
			const oldSource = firstCtx.createMediaElementSource.mock.results[0]!.value as MockSourceNode;
			const oldAnalyser = firstCtx.createAnalyser.mock.results[0]!.value as MockAnalyserNode;
			const oldGain = firstCtx.createGain.mock.results[0]!.value as MockGainNode;

			const newOutput = backend.outputNode(secondCtx as unknown as AudioContext);

			expect(oldSource.disconnect).toHaveBeenCalled();
			expect(oldAnalyser.disconnect).toHaveBeenCalled();
			expect(oldGain.disconnect).toHaveBeenCalled();
			expect(secondCtx.createMediaElementSource).toHaveBeenCalledTimes(1);
			expect(newOutput).toBe(secondCtx.createGain.mock.results[0]!.value);
		});

		it('tapping the graph upgrades crossOrigin lazily without a reload when no source is attached', () => {
			const container = makeContainer();
			const backend = new AudioElementBackend(container);
			const element = backend.mediaElement();
			expect(element.crossOrigin).toBeNull();

			const loadSpy = vi.fn();
			Object.defineProperty(element, 'load', {
				value: loadSpy,
				writable: true,
				configurable: true,
			});

			backend.outputNode(new MockAudioContext() as unknown as AudioContext);

			expect(element.crossOrigin).toBe('anonymous');
			expect(loadSpy).not.toHaveBeenCalled();
		});

		it('tapping the graph with an attached source reloads it and restores the position', () => {
			const container = makeContainer();
			const backend = new AudioElementBackend(container);
			const element = backend.mediaElement();

			element.src = 'https://cdn.example/track.mp3';
			element.currentTime = 42;

			const loadSpy = vi.fn();
			Object.defineProperty(element, 'load', {
				value: loadSpy,
				writable: true,
				configurable: true,
			});

			backend.outputNode(new MockAudioContext() as unknown as AudioContext);

			expect(element.crossOrigin).toBe('anonymous');
			expect(loadSpy).toHaveBeenCalledTimes(1);

			element.currentTime = 0;
			element.dispatchEvent(new Event('loadedmetadata'));
			expect(element.currentTime).toBe(42);
		});
	});

	// ── Guard methods ─────────────────────────────────────────────────────────

	describe('guard methods', () => {
		it('AudioElementBackend reports unsupported output protection and a running loader', () => {
			const backend = new AudioElementBackend(makeContainer());
			expect(backend.outputProtectionState()).toBe('unsupported');
			expect(backend.loaderState()).toBe('running');
		});

		it('WebAudioBackend reports unrestricted output protection and loader pause no-ops without HLS', () => {
			installAudioContext();
			const backend = new WebAudioBackend(makeContainer());

			expect(backend.outputProtectionState()).toBe('unrestricted');
			expect(backend.loaderState()).toBe('running');

			backend.pauseLoader();
			expect(backend.loaderState()).toBe('running');
			backend.resumeLoader();
			expect(backend.loaderState()).toBe('running');
		});

		it('buffered() returns the end of the last buffered range on both backends', () => {
			installAudioContext();
			const container = makeContainer();
			const elementBackend = new AudioElementBackend(container);
			const webAudioBackend = new WebAudioBackend(makeContainer());

			for (const backend of [elementBackend, webAudioBackend]) {
				Object.defineProperty(backend.mediaElement(), 'buffered', {
					value: fakeTimeRanges([10, 37.5]),
					configurable: true,
				});
				expect(backend.buffered()).toBe(37.5);
			}
		});

		it('buffered() returns 0 when nothing is buffered', () => {
			const backend = new AudioElementBackend(makeContainer());
			Object.defineProperty(backend.mediaElement(), 'buffered', {
				value: fakeTimeRanges([]),
				configurable: true,
			});
			expect(backend.buffered()).toBe(0);
		});
	});

	// ── Crossfade guards ──────────────────────────────────────────────────────

	describe('crossfade guards', () => {
		it('crossfade() without a loaded secondary rejects on both backends', async () => {
			installAudioContext();
			const elementBackend = new AudioElementBackend(makeContainer());
			const webAudioBackend = new WebAudioBackend(makeContainer());

			await expect(elementBackend.crossfade(1000)).rejects.toThrow('crossfade() called without a loaded secondary');
			await expect(webAudioBackend.crossfade(1000)).rejects.toThrow('crossfade() called without a loaded secondary');
		});

		it('primeSecondary() resolves silently when no secondary is allocated', async () => {
			installAudioContext();
			const elementBackend = new AudioElementBackend(makeContainer());
			const webAudioBackend = new WebAudioBackend(makeContainer());

			await expect(elementBackend.primeSecondary(500)).resolves.toBeUndefined();
			await expect(webAudioBackend.primeSecondary()).resolves.toBeUndefined();
		});

		it('secondaryGain(value) setter form is safe with no secondary allocated', () => {
			installAudioContext();
			const elementBackend = new AudioElementBackend(makeContainer());
			const webAudioBackend = new WebAudioBackend(makeContainer());

			expect(() => elementBackend.secondaryGain(0.5)).not.toThrow();
			expect(() => webAudioBackend.secondaryGain(0.7)).not.toThrow();
			expect(elementBackend.secondaryGain()).toBe(0);
			expect(webAudioBackend.secondaryGain()).toBe(0);
		});
	});

	// ── Mid-fade safety ───────────────────────────────────────────────────────

	describe('mid-fade safety', () => {
		it('WebAudioBackend.disposeSecondary() mid-fade ramps the secondary to silence and releases it', async () => {
			installAudioContext();
			const container = makeContainer();
			const backend = new WebAudioBackend(container);

			const loading = backend.loadSecondary('https://cdn.example/next.mp3');
			fireMetadataOnLast(container);
			await loading;

			const ctx = MockAudioContext.lastInstance!;
			const secondaryGainNode = ctx.createGain.mock.results.at(-1)!.value as MockGainNode;
			const secondaryElement = container.querySelectorAll('audio')[1]!;
			stubPlay(secondaryElement as HTMLAudioElement);

			const fade = backend.crossfade(100);

			backend.disposeSecondary();

			expect(secondaryGainNode.gain.setTargetAtTime).toHaveBeenCalledWith(0, expect.any(Number), expect.any(Number));
			expect(secondaryGainNode.disconnect).toHaveBeenCalled();
			expect(backend.secondaryGain()).toBe(0);
			expect(container.contains(secondaryElement)).toBe(false);

			await expect(fade).resolves.toBeUndefined();
		});

		it('AudioElementBackend.dispose() during an in-flight fade tears the secondary down without throwing', async () => {
			const container = makeContainer();
			const backend = new AudioElementBackend(container);

			const loading = backend.loadSecondary('https://cdn.example/next.mp3');
			fireMetadataOnLast(container);
			await loading;

			const secondaryElement = container.querySelectorAll('audio')[1]!;
			stubPlay(secondaryElement as HTMLAudioElement);
			stubPlay(backend.mediaElement());

			const fade = backend.crossfade(60);

			expect(() => backend.dispose()).not.toThrow();
			expect(backend.secondaryGain()).toBe(0);
			expect(container.contains(secondaryElement)).toBe(false);

			await expect(fade).resolves.toBeUndefined();
		});
	});

	// ── WebAudioBackend specifics ─────────────────────────────────────────────

	describe('WebAudioBackend specifics', () => {
		it('resolves the webkit-prefixed AudioContext when the unprefixed one is absent', () => {
			(globalThis as any).webkitAudioContext = MockAudioContext;

			expect(() => new WebAudioBackend(makeContainer())).not.toThrow();
		});

		it('reuses an existing <audio> element found in the container and never removes it on dispose', () => {
			installAudioContext();
			const container = makeContainer();
			const existing = document.createElement('audio');
			container.appendChild(existing);

			const backend = new WebAudioBackend(container);
			expect(backend.mediaElement()).toBe(existing);

			backend.dispose();
			expect(container.contains(existing)).toBe(true);
		});

		it('play() resumes a suspended AudioContext before playing', async () => {
			installAudioContext();
			const backend = new WebAudioBackend(makeContainer());
			const ctx = MockAudioContext.lastInstance!;
			ctx.state = 'suspended';
			stubPlay(backend.mediaElement());

			await backend.play();

			expect(ctx.resume).toHaveBeenCalledTimes(1);
			expect(backend.mediaElement().play).toHaveBeenCalledTimes(1);
		});

		it('play() skips the resume when the context is already running', async () => {
			installAudioContext();
			const backend = new WebAudioBackend(makeContainer());
			const ctx = MockAudioContext.lastInstance!;
			stubPlay(backend.mediaElement());

			await backend.play();

			expect(ctx.resume).not.toHaveBeenCalled();
		});

		it('state() starts idle, flips to loading on load() entry, and load() rejects on an element error', async () => {
			installAudioContext();
			const container = makeContainer();
			const backend = new WebAudioBackend(container);

			expect(backend.state()).toBe('idle');

			const loading = backend.load('https://cdn.example/track.mp3');
			expect(backend.state()).toBe('loading');

			// load() resolves the auth header (a microtask boundary) before it
			// attaches the loadedmetadata/error listeners — yield one macrotask
			// so the listeners exist before the error event is dispatched.
			await new Promise<void>(resolve => setTimeout(resolve, 0));
			backend.mediaElement().dispatchEvent(new Event('error'));
			await expect(loading).rejects.toBeTruthy();
		});

		it('mute() flags the element and volume() falls back to the element before the graph exists', () => {
			installAudioContext();
			const backend = new WebAudioBackend(makeContainer());
			const element = backend.mediaElement();

			backend.volume(0.5);
			const applied = element.volume;
			expect(applied).toBeGreaterThan(0);
			expect(applied).toBeLessThanOrEqual(1);
			expect(backend.volume()).toBe(applied);

			backend.mute();
			expect(element.muted).toBe(true);
		});
	});
});
