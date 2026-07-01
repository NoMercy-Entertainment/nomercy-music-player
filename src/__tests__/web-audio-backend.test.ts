// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * WebAudioBackend unit tests.
 *
 * happy-dom has no AudioContext. Tests that exercise the live graph install a
 * class-based stub on globalThis before construction and remove it after.
 * Tests that verify the no-AudioContext path rely on the pristine happy-dom
 * environment (no mock).
 */

import { BrowserPolicyError } from '@nomercy-entertainment/nomercy-player-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebAudioBackend } from '../adapters/audio-backend/web-audio';
import { NMMusicPlayer } from '../index';

// ── AudioContext stub ─────────────────────────────────────────────────────────
//
// vi.fn() returns an arrow function — not constructable with `new`. We need
// a real class constructor. The class records instances so tests can inspect
// the calls made on the created context.

class MockGainNode {
	gain = { value: 1, setTargetAtTime: vi.fn() };
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

	createGain = vi.fn(() => this._gain);
	createAnalyser = vi.fn(() => this._analyser);
	createMediaElementSource = vi.fn(() => this._source);
	resume = vi.fn(() => Promise.resolve());

	get gainNode(): MockGainNode { return this._gain; }
	get analyserNode(): MockAnalyserNode { return this._analyser; }
	get sourceNode(): MockSourceNode { return this._source; }

	constructor() {
		MockAudioContext.lastInstance = this;
	}
}

function installAudioContext(): MockAudioContext {
	(globalThis as any).AudioContext = MockAudioContext;
	// Reset the tracked instance so tests don't bleed into each other.
	MockAudioContext.lastInstance = null;
	return MockAudioContext.lastInstance!;
}

function removeAudioContext(): void {
	delete (globalThis as any).AudioContext;
	MockAudioContext.lastInstance = null;
}

/** Return the MockAudioContext instance created by the most recent `new WebAudioBackend()`. */
function lastCtx(): MockAudioContext {
	if (!MockAudioContext.lastInstance)
		throw new Error('No MockAudioContext was created yet');
	return MockAudioContext.lastInstance;
}

function makeContainer(): HTMLDivElement {
	const div = document.createElement('div');
	document.body.appendChild(div);
	return div;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('WebAudioBackend', () => {
	afterEach(() => {
		removeAudioContext();
		document.body.innerHTML = '';
	});

	// ── 1. Constructor throws when AudioContext is missing ──────────────────

	describe('constructor', () => {
		it('throws BrowserPolicyError when AudioContext is unavailable', () => {
			expect(typeof (globalThis as any).AudioContext).toBe('undefined');
			expect(typeof (globalThis as any).webkitAudioContext).toBe('undefined');

			const container = makeContainer();
			expect(() => new WebAudioBackend(container)).toThrow(BrowserPolicyError);
		});

		it('BrowserPolicyError carries code core:policy/audioContextUnsupported', () => {
			const container = makeContainer();
			let err: unknown;
			try { const _backend = new WebAudioBackend(container); void _backend; }
			catch (error) { err = error; }
			expect(err).toBeInstanceOf(BrowserPolicyError);
			expect((err as BrowserPolicyError).code).toBe('core:policy/audioContextUnsupported');
			expect((err as BrowserPolicyError).scope).toEqual({ kind: 'backend', id: 'webaudio' });
		});

		it('constructs successfully when AudioContext is available', () => {
			installAudioContext();
			const container = makeContainer();
			expect(() => new WebAudioBackend(container)).not.toThrow();
		});

		it('accepts an externally-provided AudioContext via opts', () => {
			installAudioContext();
			const externalCtx = new MockAudioContext();
			const container = makeContainer();
			expect(() => new WebAudioBackend(container, { audioContext: externalCtx as any })).not.toThrow();
		});
	});

	// ── 2. load() returns a Promise ─────────────────────────────────────────

	describe('load()', () => {
		it('returns a Promise', () => {
			installAudioContext();
			const container = makeContainer();
			const backend = new WebAudioBackend(container);

			const result = backend.load('test.mp3', { preload: 'metadata' });
			expect(result).toBeInstanceOf(Promise);
			// Settle so there is no dangling rejection.
			result.catch(() => { /* expected: happy-dom element won't load */ });
		});
	});

	// ── 3. outputNode() returns the volume GainNode ──────────────────────────

	describe('outputNode()', () => {
		it('returns the GainNode (volume tap), not the raw MediaElementAudioSourceNode', () => {
			installAudioContext();
			const container = makeContainer();
			const backend = new WebAudioBackend(container);
			const ctx = lastCtx();

			const node = backend.outputNode(ctx as unknown as AudioContext);

			// createMediaElementSource IS called — graph is still initialised.
			expect(ctx.createMediaElementSource).toHaveBeenCalledWith(backend.mediaElement());
			// But outputNode returns gainNode, not sourceNode, so volume()
			// stays in the signal path when AudioGraphPlugin takes ownership.
			expect(node).toBe(ctx.gainNode);
			expect(node).not.toBe(ctx.sourceNode);
		});

		it('is idempotent — second call returns the same GainNode without re-creating', () => {
			installAudioContext();
			const container = makeContainer();
			const backend = new WebAudioBackend(container);
			const ctx = lastCtx();

			const a = backend.outputNode(ctx as unknown as AudioContext);
			const b = backend.outputNode(ctx as unknown as AudioContext);

			expect(a).toBe(b);
			expect(a).toBe(ctx.gainNode);
			expect(ctx.createMediaElementSource).toHaveBeenCalledTimes(1);
		});
	});

	// ── 4. analyserSource() returns an AnalyserNode ──────────────────────────

	describe('analyserSource()', () => {
		it('returns the AnalyserNode tap', () => {
			installAudioContext();
			const container = makeContainer();
			const backend = new WebAudioBackend(container);
			const ctx = lastCtx();

			const node = backend.analyserSource(ctx as unknown as AudioContext);

			expect(ctx.createAnalyser).toHaveBeenCalled();
			expect(node).toBe(ctx.analyserNode);
		});

		it('AnalyserNode is a different object from the source node', () => {
			installAudioContext();
			const container = makeContainer();
			const backend = new WebAudioBackend(container);
			const ctx = lastCtx();

			const out = backend.outputNode(ctx as unknown as AudioContext);
			const an = backend.analyserSource(ctx as unknown as AudioContext);

			expect(out).not.toBe(an);
		});
	});

	// ── 5. captureStream() ──────────────────────────────────────────────────

	describe('captureStream()', () => {
		it('throws BrowserPolicyError when captureStream is absent from the element', () => {
			installAudioContext();
			const container = makeContainer();
			const backend = new WebAudioBackend(container);

			// Shadow captureStream with undefined on the element's own property to
			// simulate a browser that doesn't support it (Safari, Firefox).
			// happy-dom puts it on the prototype, so we can't delete it — we shadow
			// it with an own-property set to undefined instead.
			const el = backend.mediaElement() as any;
			Object.defineProperty(el, 'captureStream', { value: undefined, configurable: true, writable: true });

			let err: unknown;
			try { backend.captureStream(); }
			catch (error) { err = error; }
			finally { delete el.captureStream; }

			expect(err).toBeInstanceOf(BrowserPolicyError);
			expect((err as BrowserPolicyError).code).toBe('core:policy/captureStreamUnsupported');
		});

		it('returns the MediaStream when captureStream is present on the element', () => {
			installAudioContext();
			const container = makeContainer();
			const backend = new WebAudioBackend(container);

			const fakeStream = { id: 'mock-stream' } as unknown as MediaStream;
			(backend.mediaElement() as any).captureStream = () => fakeStream;

			expect(backend.captureStream()).toBe(fakeStream);
		});
	});

	// ── 6. NMMusicPlayer backend swap ────────────────────────────────────────

	describe('NMMusicPlayer backend swap', () => {
		beforeEach(() => {
			(NMMusicPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
			const div = document.createElement('div');
			div.id = 'swap-test';
			document.body.appendChild(div);
		});

		afterEach(() => {
			(NMMusicPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		});

		it('backend("webaudio") throws BrowserPolicyError in happy-dom (no AudioContext)', async () => {
			expect(typeof (globalThis as any).AudioContext).toBe('undefined');

			const player = new NMMusicPlayer('swap-test').setup({});
			await player.ready();

			let err: unknown;
			try { await player.backend('webaudio'); }
			catch (error) { err = error; }

			expect(err).toBeInstanceOf(BrowserPolicyError);
			expect((err as BrowserPolicyError).code).toBe('core:policy/audioContextUnsupported');
		});

		it('backend("webaudio") disposes old backend and emits backend:changed when AudioContext is available', async () => {
			installAudioContext();

			const player = new NMMusicPlayer('swap-test').setup({});
			await player.ready();

			const old = player.backend();
			const disposeSpy = vi.spyOn(old, 'dispose');

			const events: string[] = [];
			player.on('backend:changed', () => events.push('backend:changed'));

			await player.backend('webaudio');

			expect(disposeSpy).toHaveBeenCalled();
			expect(events).toContain('backend:changed');

			const next = player.backend();
			expect(next).toBeInstanceOf(WebAudioBackend);
			expect(next.kind).toBe('webaudio');
		});
	});
});
