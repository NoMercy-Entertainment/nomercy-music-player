// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * IAudioBackend crossfade contract tests.
 *
 * Exercises both AudioElementBackend and WebAudioBackend through their
 * shared crossfade surface. happy-dom provides HTMLAudioElement but has no
 * Web Audio API, so WebAudioBackend tests install a class-based AudioContext
 * stub on globalThis before each test and remove it after.
 */

import type { IAudioBackend } from '../adapters/audio-backend/IAudioBackend';
import { perceptualGain } from '@nomercy-entertainment/nomercy-player-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioElementBackend } from '../adapters/audio-backend/html5-audio';
import { WebAudioBackend } from '../adapters/audio-backend/web-audio';

// ── Web Audio stubs ───────────────────────────────────────────────────────────

function makeMockGain(initial = 1): {
	value: number;
	setTargetAtTime: ReturnType<typeof vi.fn>;
	setValueAtTime: ReturnType<typeof vi.fn>;
	linearRampToValueAtTime: ReturnType<typeof vi.fn>;
	cancelScheduledValues: ReturnType<typeof vi.fn>;
} {
	let _v = initial;
	const gain = {
		get value(): number { return _v; },
		set value(v: number) { _v = v; },
		setTargetAtTime: vi.fn((target: number) => { _v = target; }),
		setValueAtTime: vi.fn((target: number) => { _v = target; }),
		linearRampToValueAtTime: vi.fn((target: number) => { _v = target; }),
		cancelScheduledValues: vi.fn(),
	};
	return gain;
}

class MockGainNode {
	gain = makeMockGain(1);
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
	createAnalyser = vi.fn(() => ({ fftSize: 2048, connect: vi.fn(), disconnect: vi.fn() }));
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
	MockAudioContext.lastInstance = null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeContainer(): HTMLDivElement {
	const div = document.createElement('div');
	document.body.appendChild(div);
	return div;
}

/**
 * Stub HTMLAudioElement.play() so it resolves immediately (happy-dom does not
 * implement media playback).
 */
function stubPlay(el: HTMLAudioElement): void {
	Object.defineProperty(el, 'play', {
		value: vi.fn(() => Promise.resolve()),
		writable: true,
		configurable: true,
	});
}

/**
 * Drive the secondary element's `loadedmetadata` event so that
 * `loadSecondary()` resolves in tests (happy-dom never fires it from src=).
 */
function fireMetadata(container: HTMLElement): void {
	const audios = container.querySelectorAll('audio');
	const target = audios[audios.length - 1];
	if (target) {
		target.dispatchEvent(new Event('loadedmetadata'));
	}
}

/**
 * Drive `canplay` on the most-recently-added audio element.
 */
function fireCanPlay(container: HTMLElement): void {
	const audios = container.querySelectorAll('audio');
	const target = audios[audios.length - 1];
	if (target) {
		target.dispatchEvent(new Event('canplay'));
	}
}

// ── Shared contract suite ─────────────────────────────────────────────────────

function runCrossfadeContractSuite(
	label: string,
	makeBackend: () => IAudioBackend,
	container: () => HTMLElement,
): void {
	describe(label, () => {
		describe('supportsCrossfade()', () => {
			it('returns true', () => {
				const b = makeBackend();
				expect(b.supportsCrossfade()).toBe(true);
			});
		});

		describe('secondaryGain()', () => {
			it('returns 0 when no secondary is allocated', () => {
				const b = makeBackend();
				expect(b.secondaryGain()).toBe(0);
			});

			it('write + read round-trips through the overload', async () => {
				const b = makeBackend();

				// Start loadSecondary and immediately fire metadata so it resolves.
				const loadPromise = b.loadSecondary('http://test/track.mp3');
				fireMetadata(container());
				await loadPromise;

				b.secondaryGain(0.6);
				// secondaryGain() returns the curved gain for position 0.6, not the raw position.
				expect(b.secondaryGain()).toBeCloseTo(perceptualGain(0.6), 5);
			});

			it('clamps values outside [0, 1]', async () => {
				const b = makeBackend();

				const loadPromise = b.loadSecondary('http://test/track.mp3');
				fireMetadata(container());
				await loadPromise;

				b.secondaryGain(2);
				expect(b.secondaryGain()).toBe(1);

				b.secondaryGain(-1);
				expect(b.secondaryGain()).toBe(0);
			});
		});

		describe('loadSecondary()', () => {
			it('resolves without disrupting primary', async () => {
				const b = makeBackend();

				const loadPromise = b.loadSecondary('http://test/track.mp3');
				fireMetadata(container());
				await expect(loadPromise).resolves.toBeUndefined();
			});

			it('is idempotent for the same URL', async () => {
				const b = makeBackend();

				const p1 = b.loadSecondary('http://test/track.mp3');
				fireMetadata(container());
				await p1;

				// Second call with same URL must resolve immediately (no new metadata event needed).
				await expect(b.loadSecondary('http://test/track.mp3')).resolves.toBeUndefined();
			});
		});

		describe('disposeSecondary()', () => {
			it('is idempotent when called with no secondary allocated', () => {
				const b = makeBackend();
				expect(() => b.disposeSecondary()).not.toThrow();
				expect(() => b.disposeSecondary()).not.toThrow();
			});

			it('resets secondaryGain() to 0 after disposal', async () => {
				const b = makeBackend();

				const loadPromise = b.loadSecondary('http://test/track.mp3');
				fireMetadata(container());
				await loadPromise;

				b.secondaryGain(0.8);
				b.disposeSecondary();

				expect(b.secondaryGain()).toBe(0);
			});
		});

		describe('crossfade(0) — instant swap', () => {
			it('completes without throwing', async () => {
				const b = makeBackend();

				// Load secondary.
				const loadPromise = b.loadSecondary('http://test/next.mp3');
				fireMetadata(container());
				await loadPromise;

				// Prime secondary (fire canplay).
				const primePromise = b.primeSecondary();
				fireCanPlay(container());
				await primePromise;

				// Stub play() on the secondary element so crossfade can call it.
				const audios = container().querySelectorAll('audio');
				audios.forEach(el => stubPlay(el as HTMLAudioElement));

				await expect(b.crossfade(0)).resolves.toBeUndefined();
			});
		});
	});
}

// ── AudioElementBackend suite ─────────────────────────────────────────────────

describe('AudioElementBackend — crossfade contract', () => {
	let container: HTMLDivElement;
	let backend: AudioElementBackend;

	beforeEach(() => {
		container = makeContainer();
		backend = new AudioElementBackend(container);
	});

	afterEach(() => {
		backend.dispose();
		document.body.innerHTML = '';
	});

	runCrossfadeContractSuite(
		'shared IAudioBackend contract',
		() => backend,
		() => container,
	);

	describe('AudioElementBackend-specific: element swap on crossfade(0)', () => {
		it('secondaryGain() returns 0 after crossfade(0) — secondary slot cleared on swap', async () => {
			backend.volume(0.9);

			const loadPromise = backend.loadSecondary('http://test/next.mp3');
			fireMetadata(container);
			await loadPromise;

			const primePromise = backend.primeSecondary();
			fireCanPlay(container);
			await primePromise;

			const audios = container.querySelectorAll('audio');
			audios.forEach(el => stubPlay(el as HTMLAudioElement));

			await backend.crossfade(0);

			// AudioElementBackend swaps elements on crossfade — the secondary slot
			// is cleared, so secondaryGain() returns 0.
			expect(backend.secondaryGain()).toBe(0);
		});
	});
});

// ── WebAudioBackend suite ─────────────────────────────────────────────────────

describe('WebAudioBackend — crossfade contract', () => {
	let container: HTMLDivElement;
	let backend: WebAudioBackend;

	beforeEach(() => {
		installAudioContext();
		container = makeContainer();
		backend = new WebAudioBackend(container);
	});

	afterEach(() => {
		backend.dispose();
		removeAudioContext();
		document.body.innerHTML = '';
	});

	runCrossfadeContractSuite(
		'shared IAudioBackend contract',
		() => backend,
		() => container,
	);

	describe('WebAudio-specific: GainNode scheduling', () => {
		it('loadSecondary creates a secondary GainNode via ctx.createGain()', async () => {
			const ctx = MockAudioContext.lastInstance!;
			const createGainCallsBefore = (ctx.createGain as ReturnType<typeof vi.fn>).mock.calls.length;

			const loadPromise = backend.loadSecondary('http://test/track.mp3');
			fireMetadata(container);
			await loadPromise;

			// One extra GainNode created for the secondary chain.
			const createGainCallsAfter = (ctx.createGain as ReturnType<typeof vi.fn>).mock.calls.length;
			expect(createGainCallsAfter).toBeGreaterThan(createGainCallsBefore);
		});

		it('secondaryGain() reads from the secondary GainNode value (curved)', async () => {
			const loadPromise = backend.loadSecondary('http://test/track.mp3');
			fireMetadata(container);
			await loadPromise;

			backend.secondaryGain(0.42);
			// secondaryGain() returns the curved gain for position 0.42, not the raw position.
			expect(backend.secondaryGain()).toBeCloseTo(perceptualGain(0.42), 5);
		});

		it('disposeSecondary disconnects the secondary GainNode', async () => {
			const loadPromise = backend.loadSecondary('http://test/track.mp3');
			fireMetadata(container);
			await loadPromise;

			backend.disposeSecondary();

			// After disposal gain is reported as 0.
			expect(backend.secondaryGain()).toBe(0);
		});
	});

	describe('WebAudio-specific: crossfade(0) promotes secondary → primary', () => {
		it('mediaElement() returns the secondary element after crossfade(0)', async () => {
			const loadPromise = backend.loadSecondary('http://test/next.mp3');
			fireMetadata(container);
			await loadPromise;

			const primePromise = backend.primeSecondary();
			fireCanPlay(container);
			await primePromise;

			// Capture the secondary element before the swap.
			const raw = backend as any;
			const secondaryElBefore: HTMLAudioElement = raw._secondaryEl;
			expect(secondaryElBefore).toBeDefined();

			const audios = container.querySelectorAll('audio');
			audios.forEach(el => stubPlay(el as HTMLAudioElement));

			await backend.crossfade(0);

			// After swap: mediaElement() must be the old secondary.
			expect(backend.mediaElement()).toBe(secondaryElBefore);
		});

		it('secondary slot is cleared after crossfade(0)', async () => {
			const loadPromise = backend.loadSecondary('http://test/next.mp3');
			fireMetadata(container);
			await loadPromise;

			const primePromise = backend.primeSecondary();
			fireCanPlay(container);
			await primePromise;

			const audios = container.querySelectorAll('audio');
			audios.forEach(el => stubPlay(el as HTMLAudioElement));

			await backend.crossfade(0);

			// _secondary* fields must all be undefined.
			const raw = backend as any;
			expect(raw._secondaryEl).toBeUndefined();
			expect(raw._secondarySource).toBeUndefined();
			expect(raw._secondaryGain).toBeUndefined();

			// secondaryGain() reports 0.
			expect(backend.secondaryGain()).toBe(0);
		});

		it('volume() after crossfade(0) targets the new primary GainNode, not the disposed one', async () => {
			// Force primary Web Audio graph init so gainNode is defined before the swap.
			const ctx = MockAudioContext.lastInstance!;
			backend.outputNode(ctx as unknown as AudioContext);

			const loadPromise = backend.loadSecondary('http://test/next.mp3');
			fireMetadata(container);
			await loadPromise;

			const primePromise = backend.primeSecondary();
			fireCanPlay(container);
			await primePromise;

			const raw = backend as any;
			// Capture both GainNodes before the swap.
			const oldGain: MockGainNode = raw.gainNode;
			const newGain: MockGainNode = raw._secondaryGain;

			const audios = container.querySelectorAll('audio');
			audios.forEach(el => stubPlay(el as HTMLAudioElement));

			await backend.crossfade(0);

			// After swap, gainNode must be what was the secondary gain.
			expect(raw.gainNode).toBe(newGain);

			// Call volume() — must call setTargetAtTime on the NEW gain, not the old.
			backend.volume(0.5);
			expect((newGain.gain.setTargetAtTime as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0);

			// Old gain must NOT have received a new setTargetAtTime call after the swap
			// (calls before crossfade from ramp scheduling are allowed; we check only
			// that the call count doesn't increase after the swap).
			const oldCallCount = (oldGain.gain.setTargetAtTime as ReturnType<typeof vi.fn>).mock.calls.length;
			backend.volume(0.7);
			expect((oldGain.gain.setTargetAtTime as ReturnType<typeof vi.fn>).mock.calls.length).toBe(oldCallCount);
		});

		it('pause() after crossfade(0) pauses the new primary element', async () => {
			const loadPromise = backend.loadSecondary('http://test/next.mp3');
			fireMetadata(container);
			await loadPromise;

			const primePromise = backend.primeSecondary();
			fireCanPlay(container);
			await primePromise;

			const raw = backend as any;
			const oldEl: HTMLAudioElement = raw.element;
			const oldPauseSpy = vi.spyOn(oldEl, 'pause');

			const audios = container.querySelectorAll('audio');
			audios.forEach(el => stubPlay(el as HTMLAudioElement));

			await backend.crossfade(0);

			const newEl = backend.mediaElement();
			const newPauseSpy = vi.spyOn(newEl, 'pause');

			// Reset old pause spy call count after the crossfade-induced pause.
			oldPauseSpy.mockClear();

			backend.pause();

			expect(newPauseSpy).toHaveBeenCalled();
			expect(oldPauseSpy).not.toHaveBeenCalled();
		});
	});
});
