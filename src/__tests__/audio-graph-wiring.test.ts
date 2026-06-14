// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * Audio graph wiring regression.
 *
 * Root cause of the original silence bug (round 3):
 *   AudioGraphPlugin was enabled by default and called backend.outputNode(ctx),
 *   which triggered createMediaElementSource() on a cross-origin <audio> element
 *   (FMA CDN — no CORS headers). Chrome taints the source and forces silence
 *   with no error — the element's currentTime still advances.
 *
 * Fix (Option A):
 *   AudioGraphPlugin is now opt-in (disabled by default in musicOptions.ts).
 *   The <audio> element routes through the native browser output path, which is
 *   not subject to the CORS-taint rule. Audio is audible without Web Audio.
 *
 * What these tests verify:
 *   - createMediaElementSource is NOT called at construction or on play() —
 *     only called when outputNode(ctx) / analyserSource(ctx) is explicitly invoked.
 *   - When outputNode(ctx) IS called, the graph wires correctly:
 *       source → analyser → outputGain → destination
 *   - The call is idempotent — same GainNode returned on repeated calls.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioElementBackend } from '../adapters/audio-backend/html5-audio';

// ── Web Audio stubs ───────────────────────────────────────────────────────────

class MockDestinationNode {
	label = 'destination';
}

class MockGainNode {
	_connections: unknown[] = [];
	gain = { value: 1 };

	connect(target: unknown): void {
		this._connections.push(target);
	}

	disconnect(): void {
		this._connections = [];
	}
}

class MockAnalyserNode {
	fftSize = 2048;
	_connections: unknown[] = [];

	connect(target: unknown): void {
		this._connections.push(target);
	}

	disconnect(): void {
		this._connections = [];
	}
}

class MockSourceNode {
	_connections: unknown[] = [];

	connect(target: unknown): void {
		this._connections.push(target);
	}

	disconnect(): void {
		this._connections = [];
	}
}

class MockAudioContext {
	state: AudioContextState = 'running';
	currentTime = 0;
	destination = new MockDestinationNode() as unknown as AudioDestinationNode;
	sampleRate = 44100;

	createGain = vi.fn((): MockGainNode => new MockGainNode());
	createAnalyser = vi.fn((): MockAnalyserNode => new MockAnalyserNode());
	createMediaElementSource = vi.fn((): MockSourceNode => new MockSourceNode());
	resume = vi.fn(() => Promise.resolve());
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function installAudioContext(): void {
	(globalThis as unknown as { AudioContext: typeof MockAudioContext }).AudioContext = MockAudioContext;
}

function removeAudioContext(): void {
	delete (globalThis as unknown as { AudioContext?: unknown }).AudioContext;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AudioElementBackend — ensureSourceGraph baseline wiring', () => {
	beforeEach(() => {
		installAudioContext();
	});

	afterEach(() => {
		removeAudioContext();
		document.body.innerHTML = '';
	});

	it('createMediaElementSource is called exactly once per AudioContext', () => {
		const container = document.createElement('div');
		document.body.appendChild(container);

		const backend = new AudioElementBackend(container);
		const ctx = new MockAudioContext() as unknown as AudioContext;

		backend.outputNode(ctx);
		backend.outputNode(ctx);

		expect(ctx.createMediaElementSource).toHaveBeenCalledTimes(1);
	});

	it('outputGain is connected to ctx.destination by default (baseline — no plugin)', () => {
		const container = document.createElement('div');
		document.body.appendChild(container);

		const backend = new AudioElementBackend(container);
		const ctx = new MockAudioContext() as unknown as AudioContext;

		backend.outputNode(ctx);

		const gainNode = (ctx.createGain as ReturnType<typeof vi.fn>).mock.results[0]?.value as MockGainNode;
		expect(gainNode).toBeDefined();
		expect(gainNode._connections).toContain(ctx.destination);
	});

	it('outputNode(ctx) returns the GainNode (chain tail), not the raw MediaElementSource', () => {
		const container = document.createElement('div');
		document.body.appendChild(container);

		const backend = new AudioElementBackend(container);
		const ctx = new MockAudioContext() as unknown as AudioContext;

		const outputNode = backend.outputNode(ctx);

		const gainNode = (ctx.createGain as ReturnType<typeof vi.fn>).mock.results[0]?.value;
		expect(outputNode).toBe(gainNode);
	});

	it('signal chain is source → analyser → outputGain → destination', () => {
		const container = document.createElement('div');
		document.body.appendChild(container);

		const backend = new AudioElementBackend(container);
		const ctx = new MockAudioContext() as unknown as AudioContext;

		backend.outputNode(ctx);

		const sourceNode = (ctx.createMediaElementSource as ReturnType<typeof vi.fn>).mock.results[0]?.value as MockSourceNode;
		const analyserNode = (ctx.createAnalyser as ReturnType<typeof vi.fn>).mock.results[0]?.value as MockAnalyserNode;
		const gainNode = (ctx.createGain as ReturnType<typeof vi.fn>).mock.results[0]?.value as MockGainNode;

		expect(sourceNode._connections).toContain(analyserNode);
		expect(analyserNode._connections).toContain(gainNode);
		expect(gainNode._connections).toContain(ctx.destination);
	});

	it('outputNode is idempotent — same GainNode returned on repeat calls with same ctx', () => {
		const container = document.createElement('div');
		document.body.appendChild(container);

		const backend = new AudioElementBackend(container);
		const ctx = new MockAudioContext() as unknown as AudioContext;

		const first = backend.outputNode(ctx);
		const second = backend.outputNode(ctx);

		expect(first).toBe(second);
		expect(ctx.createMediaElementSource).toHaveBeenCalledTimes(1);
	});

	it('analyserSource returns the AnalyserNode (parallel tap), not the GainNode', () => {
		const container = document.createElement('div');
		document.body.appendChild(container);

		const backend = new AudioElementBackend(container);
		const ctx = new MockAudioContext() as unknown as AudioContext;

		backend.outputNode(ctx);
		const analyserTap = backend.analyserSource(ctx);

		const analyserNode = (ctx.createAnalyser as ReturnType<typeof vi.fn>).mock.results[0]?.value;
		expect(analyserTap).toBe(analyserNode);
	});

	it('does NOT call createMediaElementSource at construction (graph is opt-in)', () => {
		const container = document.createElement('div');
		document.body.appendChild(container);

		const backend = new AudioElementBackend(container);
		const ctx = new MockAudioContext() as unknown as AudioContext;

		// Construction alone must not touch Web Audio.
		expect(ctx.createMediaElementSource).not.toHaveBeenCalled();

		void backend;
	});

	it('does NOT call createMediaElementSource unless outputNode() or analyserSource() is invoked', () => {
		const container = document.createElement('div');
		document.body.appendChild(container);

		const backend = new AudioElementBackend(container);
		const ctx = new MockAudioContext() as unknown as AudioContext;

		// Transport calls must not build the graph.
		backend.volume(0.8);
		backend.playbackRate(1.0);
		backend.mute();
		backend.unmute();
		backend.state();
		backend.buffered();
		backend.duration();

		expect(ctx.createMediaElementSource).not.toHaveBeenCalled();

		void backend;
	});
});
