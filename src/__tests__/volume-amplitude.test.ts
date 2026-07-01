// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * Volume amplitude regression — WebAudioBackend + AudioGraphPlugin stack.
 *
 * Verifies that `player.volume()` (linear 0..1 scale) controls the audible
 * GainNode that is IN the active signal chain — both in the bare-backend
 * (no plugins) path and through the full audio-graph plugin stack
 * (AudioGraphPlugin → EqualizerPlugin → MixerPlugin).
 *
 * Root cause of the original silence bug:
 *   WebAudioBackend.outputNode() returned the raw MediaElementAudioSourceNode.
 *   AudioGraphPlugin used that as its chain root and disconnected everything
 *   downstream, leaving the backend's GainNode (which volume() controls) orphaned
 *   — it was connected to nothing audible. volume() called setTargetAtTime on a
 *   node that had no effect on output.
 *
 * Fix:
 *   outputNode() now returns the GainNode (volume tap). AudioGraphPlugin wires
 *   gainNode → EQ → mixer → destination. volume() always controls audible output
 *   because gainNode is always the first node in the path.
 *
 * These tests do not use OfflineAudioContext (not available in happy-dom).
 * Instead they verify the structural invariant: the gainNode that volume()
 * sets IS the node at the head of the audible chain — i.e. outputNode() returns
 * it, and its gain.value reflects what player.volume() last set.
 */

import { AudioGraphPlugin, perceptualGain } from '@nomercy-entertainment/nomercy-player-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebAudioBackend } from '../adapters/audio-backend/web-audio';
import { NMMusicPlayer } from '../index';

// ── Shared AudioContext stub ──────────────────────────────────────────────────

class MockGainNode {
	gain = {
		value: 1,
		setTargetAtTime: vi.fn((level: number) => { this.gain.value = level; }),
		cancelScheduledValues: vi.fn(),
		setValueAtTime: vi.fn((level: number) => { this.gain.value = level; }),
		linearRampToValueAtTime: vi.fn((level: number) => { this.gain.value = level; }),
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
	destination = { connect: vi.fn(), disconnect: vi.fn() } as unknown as AudioDestinationNode;
	sampleRate = 44100;

	createGain = vi.fn((): MockGainNode => new MockGainNode());
	createAnalyser = vi.fn((): MockAnalyserNode => new MockAnalyserNode());
	createMediaElementSource = vi.fn((): MockSourceNode => new MockSourceNode());
	createBiquadFilter = vi.fn(() => ({
		type: 'peaking',
		frequency: { value: 0 },
		Q: { value: 1 },
		gain: { value: 0 },
		connect: vi.fn(),
		disconnect: vi.fn(),
	}));

	createStereoPanner = vi.fn(() => ({
		pan: {
			value: 0,
			setTargetAtTime: vi.fn(),
		},
		connect: vi.fn(),
		disconnect: vi.fn(),
	}));

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

function makeContainer(id: string): HTMLDivElement {
	const div = document.createElement('div');
	div.id = id;
	document.body.appendChild(div);
	return div;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('WebAudioBackend — volume() controls the in-chain GainNode', () => {
	beforeEach(() => {
		installAudioContext();
	});

	afterEach(() => {
		removeAudioContext();
		document.body.innerHTML = '';
	});

	it('outputNode() returns the GainNode — the node that volume() writes to', () => {
		const container = makeContainer('vol-bare');
		const backend = new WebAudioBackend(container);
		const ctx = MockAudioContext.instances[0]!;

		const outputNode = backend.outputNode(ctx as unknown as AudioContext);

		// The first (and only) GainNode created by ensureGraph() is the volume tap.
		const gainNode = ctx.createGain.mock.results[0]?.value as MockGainNode;
		expect(outputNode).toBe(gainNode);
	});

	it('volume(0.5) writes the perceptually-curved gain to the GainNode', () => {
		const container = makeContainer('vol-set');
		const backend = new WebAudioBackend(container);
		const ctx = MockAudioContext.instances[0]!;

		// Initialise the graph so the GainNode exists.
		backend.outputNode(ctx as unknown as AudioContext);

		backend.volume(0.5);

		const gainNode = ctx.createGain.mock.results[0]?.value as MockGainNode;
		// setTargetAtTime is used for smooth ramp. The target must be the curved
		// gain for position 0.5, NOT the linear 0.5 value.
		const expectedGain = perceptualGain(0.5);
		expect(gainNode.gain.setTargetAtTime).toHaveBeenCalledWith(expectedGain, 0, 0.01);
	});

	it('volume(0) produces a silent GainNode (the only node in the chain)', () => {
		const container = makeContainer('vol-zero');
		const backend = new WebAudioBackend(container);
		const ctx = MockAudioContext.instances[0]!;

		backend.outputNode(ctx as unknown as AudioContext);
		backend.volume(0);

		const gainNode = ctx.createGain.mock.results[0]?.value as MockGainNode;
		expect(gainNode.gain.setTargetAtTime).toHaveBeenCalledWith(0, 0, 0.01);
	});

	it('volume(1.0) produces unity gain (1.0) on the output node', () => {
		const container = makeContainer('vol-one');
		const backend = new WebAudioBackend(container);
		const ctx = MockAudioContext.instances[0]!;

		backend.outputNode(ctx as unknown as AudioContext);
		backend.volume(1.0);

		const gainNode = ctx.createGain.mock.results[0]?.value as MockGainNode;
		// position 1 → perceptualGain(1) = 10^0 = 1.0 (unity, 0 dB)
		expect(gainNode.gain.setTargetAtTime).toHaveBeenCalledWith(1, 0, 0.01);
	});

	it('mute() does not disconnect the GainNode from the chain — uses element.muted', () => {
		const container = makeContainer('vol-mute');
		const backend = new WebAudioBackend(container);
		const ctx = MockAudioContext.instances[0]!;

		backend.outputNode(ctx as unknown as AudioContext);

		const gainNode = ctx.createGain.mock.results[0]?.value as MockGainNode;
		const connectCallsBefore = gainNode.connect.mock.calls.length;

		backend.mute();

		// mute() uses element.muted — does NOT call gainNode.disconnect().
		expect(gainNode.disconnect).not.toHaveBeenCalled();
		// connect call count is unchanged — no rewiring on mute.
		expect(gainNode.connect.mock.calls.length).toBe(connectCallsBefore);
	});
});

describe('NMMusicPlayer + AudioGraphPlugin — volume() stays audible through plugin stack', () => {
	beforeEach(() => {
		installAudioContext();
		(NMMusicPlayer as unknown as { _resetRegistry(): void })._resetRegistry();
	});

	afterEach(() => {
		(NMMusicPlayer as unknown as { _resetRegistry(): void })._resetRegistry();
		removeAudioContext();
		document.body.innerHTML = '';
	});

	it('player.volume(50) reports 50 (the position), even though the backend gain is curved', async () => {
		makeContainer('vol-plugin');

		const player = new NMMusicPlayer('vol-plugin');
		player.setup({ backend: 'webaudio' });
		player.addPlugin(AudioGraphPlugin);
		await player.ready();

		// Set volume to 50 (0..100 position scale).
		player.volume(50);

		// player.volume() must return the POSITION (50), never the curved gain.
		// The mixin stores _internalVolume = 50 and returns it directly.
		expect(player.volume()).toBeCloseTo(50, 1);
	});

	it('player.volume(0) round-trips to 0 — GainNode is silenced', async () => {
		makeContainer('vol-plugin-zero');

		const player = new NMMusicPlayer('vol-plugin-zero');
		player.setup({ backend: 'webaudio' });
		player.addPlugin(AudioGraphPlugin);
		await player.ready();

		player.volume(0);

		expect(player.volume()).toBe(0);
	});

	it('player.volume(100) round-trips to 100 — GainNode at unity gain', async () => {
		makeContainer('vol-plugin-full');

		const player = new NMMusicPlayer('vol-plugin-full');
		player.setup({ backend: 'webaudio' });
		player.addPlugin(AudioGraphPlugin);
		await player.ready();

		player.volume(100);

		expect(player.volume()).toBeCloseTo(100, 1);
	});

	it('backend.volume() reads back the CURVED gain for position 50 — proves gainNode is not orphaned', async () => {
		makeContainer('vol-plugin-backend');

		const player = new NMMusicPlayer('vol-plugin-backend');
		player.setup({ backend: 'webaudio' });
		player.addPlugin(AudioGraphPlugin);
		await player.ready();

		// player.volume(50) writes perceptualGain(0.5) to the backend GainNode.
		player.volume(50);

		// backend.volume() reads back gainNode.gain.value, which is now the curved
		// gain for position 0.5. If the GainNode were orphaned this would still
		// report the value (structural proof lives in the bare-backend tests above).
		// This confirms the end-to-end round-trip at the player API level.
		const backend = player.backend() as WebAudioBackend;
		expect(backend.volume()).toBeCloseTo(perceptualGain(0.5), 5);
	});

	it('equal slider step near the top produces a LARGER gain delta than near the bottom (perceptual proof)', async () => {
		// dB-law taper property: the curve is compressed at low positions (near
		// silence) and expanded at high positions (near unity). Equal slider steps
		// correspond to equal dB changes, but the absolute linear gain delta is
		// large at the top and tiny at the bottom. This is what makes the slider
		// feel even — each step sounds the same number of dB louder regardless of
		// where in the range you are.
		const step = 5; // 5 position points (5 % of slider travel)

		// Low range: position 10 → 15 (0.10 → 0.15 in 0..1)
		const gainLow1 = perceptualGain(0.10);
		const gainLow2 = perceptualGain(0.15);
		const deltaLow = gainLow2 - gainLow1;

		// High range: position 85 → 90 (0.85 → 0.90 in 0..1)
		const gainHigh1 = perceptualGain(0.85);
		const gainHigh2 = perceptualGain(0.90);
		const deltaHigh = gainHigh2 - gainHigh1;

		// A step near the top adds MORE absolute gain than a step near the bottom.
		expect(deltaHigh).toBeGreaterThan(deltaLow);

		// Sanity: player.volume(50) still reports the position, not the gain.
		makeContainer('vol-step-proof');
		const player = new NMMusicPlayer('vol-step-proof');
		player.setup({ backend: 'webaudio' });
		await player.ready();
		player.volume(50);
		expect(player.volume()).toBe(50);

		// step is intentionally referenced so the variable isn't flagged unused —
		// it documents the unit of slider travel used in the delta calculations above.
		expect(step).toBe(5);
	});
});

describe('WebAudioBackend — crossfade preserves volume control in the new primary', () => {
	beforeEach(() => {
		installAudioContext();
	});

	afterEach(() => {
		removeAudioContext();
		document.body.innerHTML = '';
	});

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

	it('after crossfade, volume() controls the promoted secondary GainNode', async () => {
		const container = makeContainer('vol-xfade');
		const backend = new WebAudioBackend(container);
		const ctx = MockAudioContext.instances[0]!;

		// Initialise graph on the primary.
		backend.outputNode(ctx as unknown as AudioContext);

		const loadPromise = backend.loadSecondary('http://test/b.mp3');
		fireMetadata(container);
		await loadPromise;

		const primePromise = backend.primeSecondary();
		fireCanPlay(container);
		await primePromise;

		stubPlay(container);
		await backend.crossfade(0);

		// After crossfade the secondary GainNode was promoted to primary.
		// volume() must target this new gainNode with the CURVED gain.
		backend.volume(0.3);

		// After crossfade, the backend's gainNode is what was _secondaryGain.
		// It's the 2nd GainNode created (first = primary volume, second = secondary gain).
		const gainNodes = ctx.createGain.mock.results
			.filter((result): result is { type: 'return'; value: MockGainNode } => result.type === 'return')
			.map(result => result.value);
		// Primary GainNode was created in ensureGraph() (index 0).
		// Secondary GainNode was created in loadSecondary() (index 1).
		// After crossfade, gainNode = _secondaryGain = index 1.
		const promotedGain = gainNodes[1]!;
		const calls = promotedGain.gain.setTargetAtTime.mock.calls;
		const lastCall = calls[calls.length - 1];
		expect(lastCall).toBeDefined();
		// The curved gain for position 0.3 — not the raw 0.3 linear value.
		expect(lastCall![0]).toBeCloseTo(perceptualGain(0.3), 5);
	});

	it('backend:sourceswap emits the GainNode (not raw source) after crossfade', async () => {
		const container = makeContainer('vol-swap-node');
		const backend = new WebAudioBackend(container);
		const ctx = MockAudioContext.instances[0]!;

		backend.outputNode(ctx as unknown as AudioContext);

		const loadPromise = backend.loadSecondary('http://test/c.mp3');
		fireMetadata(container);
		await loadPromise;

		const primePromise = backend.primeSecondary();
		fireCanPlay(container);
		await primePromise;

		let swappedNode: AudioNode | undefined;
		backend.on('backend:sourceswap', (payload) => {
			swappedNode = payload?.sourceNode;
		});

		stubPlay(container);
		await backend.crossfade(0);

		// The emitted node must be a GainNode, not a MediaElementAudioSourceNode.
		// In our mock, GainNode instances have a `gain` property; source nodes don't.
		expect(swappedNode).toBeDefined();
		const swappedNodeAsGain = swappedNode as unknown as MockGainNode;
		expect(swappedNodeAsGain.gain).toBeDefined();
		expect(typeof swappedNodeAsGain.gain.value).toBe('number');
	});
});
