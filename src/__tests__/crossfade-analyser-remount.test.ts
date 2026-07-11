// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * WebAudioBackend crossfade AnalyserNode remount regression suite (Bug 2).
 *
 * Baseline graph topology is `source → gain → analyser → destination`
 * (`ensureGraph()`). `loadSecondary()` built the secondary chain as
 * `secondarySource → secondaryGain → destination` with NO analyser, and the
 * crossfade promotion block reassigned `sourceNode`/`gainNode` to the
 * secondary pair but never touched `this.analyserNode` — it kept pointing at
 * the old analyser that promotion's `oldGain.disconnect()` had just cut off.
 * `ensureGraph()` early-returns once `gainNode` exists, so the dead analyser
 * was never rebuilt: `analyserSource(ctx)` fed a permanently orphaned node,
 * silently killing spectrum/visualizer plugins after the first crossfade.
 *
 * Covers:
 *   1. `loadSecondary()` builds a secondary analyser wired
 *      `secondaryGain → secondaryAnalyser → destination`, matching baseline.
 *   2. Promotion reassigns `this.analyserNode` to the promoted analyser, and
 *      `analyserSource(ctx)` returns the live (fresh) node afterward.
 *   3. The old analyser is disconnected during promotion (no dangling tap).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebAudioBackend } from '../adapters/audio-backend/web-audio';

// ── Web Audio stubs ───────────────────────────────────────────────────────────

class MockGainNode {
	gain = {
		value: 1,
		setTargetAtTime: vi.fn((level: number) => { this.gain.value = level; }),
		setValueAtTime: vi.fn((level: number) => { this.gain.value = level; }),
		linearRampToValueAtTime: vi.fn((level: number) => { this.gain.value = level; }),
		cancelScheduledValues: vi.fn(),
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

	createGain = vi.fn(() => new MockGainNode());
	createAnalyser = vi.fn(() => new MockAnalyserNode());
	createMediaElementSource = vi.fn(() => new MockSourceNode());
	resume = vi.fn(() => Promise.resolve());

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

// ── Shared DOM helpers ────────────────────────────────────────────────────────

function makeContainer(): HTMLDivElement {
	const div = document.createElement('div');
	document.body.appendChild(div);
	return div;
}

function fireMetadata(container: HTMLElement): void {
	const audios = container.querySelectorAll('audio');
	const last = audios[audios.length - 1];
	if (last)
		last.dispatchEvent(new Event('loadedmetadata'));
}

function fireCanPlay(container: HTMLElement): void {
	const audios = container.querySelectorAll('audio');
	const last = audios[audios.length - 1];
	if (last)
		last.dispatchEvent(new Event('canplay'));
}

function stubPlay(container: HTMLElement): void {
	container.querySelectorAll('audio').forEach((el) => {
		Object.defineProperty(el, 'play', {
			value: vi.fn(() => Promise.resolve()),
			writable: true,
			configurable: true,
		});
	});
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('WebAudioBackend — analyser survives crossfade (Bug 2)', () => {
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

	it('loadSecondary() builds a secondary analyser wired gain → analyser → destination', async () => {
		const loadPromise = backend.loadSecondary('http://test/next.mp3');
		fireMetadata(container);
		await loadPromise;

		const raw = backend as unknown as {
			_secondaryGain?: MockGainNode;
			_secondaryAnalyser?: MockAnalyserNode;
		};

		expect(raw._secondaryAnalyser).toBeDefined();
		expect(raw._secondaryGain!.connect).toHaveBeenCalledWith(raw._secondaryAnalyser);

		const ctx = MockAudioContext.lastInstance!;
		expect(raw._secondaryAnalyser!.connect).toHaveBeenCalledWith(ctx.destination);
	});

	it('reassigns analyserNode to the promoted node after crossfade(0), and disconnects the old one', async () => {
		const ctx = MockAudioContext.lastInstance! as unknown as AudioContext;

		// Force baseline graph creation so there is an old analyser to disconnect.
		backend.outputNode(ctx);
		const analyserBefore = backend.analyserSource(ctx) as unknown as MockAnalyserNode;

		const loadPromise = backend.loadSecondary('http://test/next.mp3');
		fireMetadata(container);
		await loadPromise;

		const primePromise = backend.primeSecondary();
		fireCanPlay(container);
		await primePromise;

		const raw = backend as unknown as { _secondaryAnalyser?: MockAnalyserNode };
		const secondaryAnalyser = raw._secondaryAnalyser!;
		expect(secondaryAnalyser).toBeDefined();

		stubPlay(container);
		await backend.crossfade(0);

		// The old (pre-crossfade) analyser must be disconnected — no dangling tap.
		expect(analyserBefore.disconnect).toHaveBeenCalled();

		// analyserSource() must now return the promoted (fresh) node, not the dead one.
		const analyserAfter = backend.analyserSource(ctx);
		expect(analyserAfter).toBe(secondaryAnalyser);
		expect(analyserAfter).not.toBe(analyserBefore);
	});
});
