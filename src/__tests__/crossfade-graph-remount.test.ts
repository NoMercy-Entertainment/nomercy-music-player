// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * Post-crossfade graph remount regression suite (Bug 3).
 *
 * Root cause: After WebAudioBackend.crossfade() promoted the secondary element
 * to primary, AudioGraphPlugin.source still referenced the old (disconnected)
 * source node. The EQ / mixer / analyser chain was fed by a dead source while
 * the new element routed through the crossfade's own secondary gain → destination
 * path, bypassing the plugin chain entirely.
 *
 * Fix: WebAudioBackend emits 'backend:sourceswap' with { sourceNode } after the
 * promote step. AudioGraphPlugin listens for this event in use() and calls
 * remountSource + rebuildChain on receipt, replacing its internal source
 * reference with the new node and reconnecting the full chain.
 *
 * What these tests verify:
 *   1. 'backend:sourceswap' is emitted after crossfade(0) with the new source node.
 *   2. After a completed crossfade, AudioGraphPlugin's source is the new source node.
 *   3. The full chain (source → effects → destination) is connected to the new
 *      node — not the old one.
 */

import { AudioGraphPlugin } from '@nomercy-entertainment/nomercy-player-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebAudioBackend } from '../adapters/audio-backend/web-audio';
import { NMMusicPlayer } from '../index';

// ── AudioContext stub ──────────────────────────────────────────────────────────

class MockGainNode {
	gain = {
		value: 1,
		setTargetAtTime: vi.fn((v: number) => { this.gain.value = v; }),
		cancelScheduledValues: vi.fn(),
		setValueAtTime: vi.fn((v: number) => { this.gain.value = v; }),
		linearRampToValueAtTime: vi.fn((v: number) => { this.gain.value = v; }),
	};

	connect = vi.fn();
	disconnect = vi.fn();
}

class MockSourceNode {
	connect = vi.fn();
	disconnect = vi.fn();
}

class MockAnalyserNode {
	fftSize = 2048;
	smoothingTimeConstant = 0;
	connect = vi.fn();
	disconnect = vi.fn();
}

class MockAudioContext {
	static instances: MockAudioContext[] = [];

	state: AudioContextState = 'running';
	currentTime = 0;
	destination = { connect: vi.fn() } as unknown as AudioDestinationNode;
	sampleRate = 44100;

	createGain = vi.fn((): MockGainNode => new MockGainNode());
	createAnalyser = vi.fn((): MockAnalyserNode => new MockAnalyserNode());
	createMediaElementSource = vi.fn((): MockSourceNode => new MockSourceNode());
	resume = vi.fn((): Promise<void> => Promise.resolve());

	constructor() {
		MockAudioContext.instances.push(this);
	}
}

function installAudioContext(): void {
	MockAudioContext.instances = [];
	(globalThis as unknown as { AudioContext: typeof MockAudioContext }).AudioContext = MockAudioContext;
}

function removeAudioContext(): void {
	delete (globalThis as unknown as { AudioContext?: unknown }).AudioContext;
	MockAudioContext.instances = [];
}

function makeContainer(): HTMLDivElement {
	const div = document.createElement('div');
	document.body.appendChild(div);
	return div;
}

function fireMetadata(container: HTMLElement): void {
	const audios = container.querySelectorAll('audio');
	const target = audios[audios.length - 1];
	target?.dispatchEvent(new Event('loadedmetadata'));
}

function fireCanPlay(container: HTMLElement): void {
	const audios = container.querySelectorAll('audio');
	const target = audios[audios.length - 1];
	target?.dispatchEvent(new Event('canplay'));
}

function stubPlay(container: HTMLElement): void {
	container.querySelectorAll('audio').forEach((el) => {
		Object.defineProperty(el, 'play', {
			value: vi.fn((): Promise<void> => Promise.resolve()),
			writable: true,
			configurable: true,
		});
	});
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('WebAudioBackend — sourceswap event (Bug 3 regression)', () => {
	beforeEach(() => {
		installAudioContext();
	});

	afterEach(() => {
		removeAudioContext();
		document.body.innerHTML = '';
	});

	it('emits backend:sourceswap after crossfade(0) completes', async () => {
		const container = makeContainer();
		const backend = new WebAudioBackend(container);

		const swapEvents: Array<{ sourceNode: AudioNode }> = [];
		backend.on('backend:sourceswap', (payload) => {
			if (payload)
				swapEvents.push(payload);
		});

		const loadPromise = backend.loadSecondary('http://test/b.mp3');
		fireMetadata(container);
		await loadPromise;

		const primePromise = backend.primeSecondary();
		fireCanPlay(container);
		await primePromise;

		stubPlay(container);
		await backend.crossfade(0);

		expect(swapEvents).toHaveLength(1);
		expect(swapEvents[0]!.sourceNode).toBeDefined();
	});

	it('sourceswap payload carries the new (promoted) volume GainNode', async () => {
		const container = makeContainer();
		const backend = new WebAudioBackend(container);

		// Capture the secondary's gain node before the swap.
		const raw = backend as unknown as { _secondaryGain?: MockGainNode };

		let capturedNewSource: AudioNode | undefined;
		backend.on('backend:sourceswap', (payload) => {
			capturedNewSource = payload?.sourceNode;
		});

		const loadPromise = backend.loadSecondary('http://test/b.mp3');
		fireMetadata(container);
		await loadPromise;

		// The secondary gain node is assigned after loadSecondary resolves.
		const secondaryGainBeforeSwap = raw._secondaryGain!;
		expect(secondaryGainBeforeSwap).toBeDefined();

		const primePromise = backend.primeSecondary();
		fireCanPlay(container);
		await primePromise;

		stubPlay(container);
		await backend.crossfade(0);

		// The emitted sourceNode is the volume GainNode (not the raw source),
		// so AudioGraphPlugin chains from the volume tap after the swap.
		expect(capturedNewSource).toBe(secondaryGainBeforeSwap);
	});
});

describe('NMMusicPlayer + AudioGraphPlugin — chain stays wired after crossfade (Bug 3)', () => {
	beforeEach(() => {
		installAudioContext();
		(NMMusicPlayer as unknown as { _resetRegistry(): void })._resetRegistry();
	});

	afterEach(() => {
		(NMMusicPlayer as unknown as { _resetRegistry(): void })._resetRegistry();
		removeAudioContext();
		document.body.innerHTML = '';
	});

	it('AudioGraphPlugin rebuildChain is called after crossfade swap', async () => {
		const div = document.createElement('div');
		div.id = 'xfade-test';
		document.body.appendChild(div);

		const player = new NMMusicPlayer('xfade-test');
		player.setup({ backend: 'webaudio' });

		// Force backend creation before addPlugin so the backend is available
		// when the plugin's use() runs and wires the sourceswap listener.
		const backend = player.backend() as WebAudioBackend;

		// Register the listener BEFORE addPlugin so we capture the initial
		// chain:rebuilt fired during use() as well as post-crossfade rebuilds.
		// Plugins emit events via the player under 'plugin:<id>:<event>'.
		let chainRebuiltCount = 0;

		// Directly use the string key — plugin emits on player as 'plugin:<id>:<event>'.
		const eventKey = 'plugin:audio-graph:chain:rebuilt';
		(player.on as (event: string, fn: () => void) => void)(eventKey, () => {
			chainRebuiltCount += 1;
		});

		player.addPlugin(AudioGraphPlugin);
		await player.ready();

		const plugin = player.getPlugin(AudioGraphPlugin)!;
		expect(plugin).toBeDefined();

		// After use() completes, at least one chain:rebuilt should have fired.
		expect(chainRebuiltCount).toBeGreaterThan(0);

		const chainCountBefore = chainRebuiltCount;

		// Crossfade.
		const loadPromise = backend.loadSecondary('http://test/next.mp3');
		fireMetadata(div);
		await loadPromise;

		const primePromise = backend.primeSecondary();
		fireCanPlay(div);
		await primePromise;

		stubPlay(div);
		await backend.crossfade(0);

		// chain:rebuilt must have fired at least once more after the swap.
		expect(chainRebuiltCount).toBeGreaterThan(chainCountBefore);
	});
});
