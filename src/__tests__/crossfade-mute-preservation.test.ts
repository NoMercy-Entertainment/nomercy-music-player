// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * Crossfade mute-preservation regression suite.
 *
 * A fresh secondary `<audio>` element always defaults `muted=false`. Neither
 * `crossfade()` nor the primary/secondary swap copied the outgoing primary's
 * `muted` flag onto the promoted element, so a muted player became audible
 * the moment a crossfade completed — the core's `_volumeState` still reports
 * MUTED (it never touched the backend), so `player.volume()` silently lies
 * while the promoted element plays at full volume.
 *
 * Covers both backends: `AudioElementBackend` swaps `<audio>` elements
 * directly; `WebAudioBackend` swaps both the element and its GainNode pair.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioElementBackend } from '../adapters/audio-backend/html5-audio';
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

// ── AudioElementBackend ────────────────────────────────────────────────────────

describe('AudioElementBackend — mute survives crossfade (Bug 1)', () => {
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

	it('keeps mediaElement().muted true after crossfade(0) promotes the secondary', async () => {
		backend.mute();
		expect(backend.mediaElement().muted).toBe(true);

		const loadPromise = backend.loadSecondary('http://test/next.mp3');
		fireMetadata(container);
		await loadPromise;

		const primePromise = backend.primeSecondary();
		fireCanPlay(container);
		await primePromise;

		stubPlay(container);
		await backend.crossfade(0);

		expect(backend.mediaElement().muted).toBe(true);
	});
});

// ── WebAudioBackend ────────────────────────────────────────────────────────────

describe('WebAudioBackend — mute survives crossfade (Bug 1)', () => {
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

	it('keeps mediaElement().muted true after crossfade(0) promotes the secondary', async () => {
		backend.mute();
		expect(backend.mediaElement().muted).toBe(true);

		const loadPromise = backend.loadSecondary('http://test/next.mp3');
		fireMetadata(container);
		await loadPromise;

		const primePromise = backend.primeSecondary();
		fireCanPlay(container);
		await primePromise;

		stubPlay(container);
		await backend.crossfade(0);

		expect(backend.mediaElement().muted).toBe(true);
	});
});
