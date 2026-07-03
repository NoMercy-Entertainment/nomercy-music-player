// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * Regression tests for _wireBackend correctness.
 *
 * Three invariants that must hold:
 *   1. Phase transition 'starting'→'playing' fires from the backend 'play' event,
 *      not only from canplay — canplay may not re-fire if audio was already buffered.
 *   2. The 'duration' event reads instance.duration() directly; the backend emits
 *      a raw DOM Event, not { duration: number }.
 *   3. backend() lazy init respects MusicPlayerConfig.backend — 'webaudio' creates
 *      WebAudioBackend, not the default AudioElementBackend.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioElementBackend } from '../adapters/audio-backend/html5-audio';
import { WebAudioBackend } from '../adapters/audio-backend/web-audio';
import { NMMusicPlayer } from '../index';

// ── Web Audio stubs ───────────────────────────────────────────────────────────

class MockGainNode {
	gain = {
		value: 1,
		setTargetAtTime: vi.fn(),
		setValueAtTime: vi.fn(),
		linearRampToValueAtTime: vi.fn(),
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
	state: AudioContextState = 'running';
	currentTime = 0;
	destination = {} as AudioDestinationNode;

	createGain = vi.fn(() => new MockGainNode());
	createAnalyser = vi.fn(() => new MockAnalyserNode());
	createMediaElementSource = vi.fn(() => new MockSourceNode());
	resume = vi.fn(() => Promise.resolve());
}

function installAudioContext(): void {
	(globalThis as unknown as { AudioContext: typeof MockAudioContext }).AudioContext = MockAudioContext;
}

function removeAudioContext(): void {
	delete (globalThis as unknown as { AudioContext?: unknown }).AudioContext;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a player, trigger the backend's lazy init, and wait for 'ready' phase.
 * Returns the player + the audio element the backend created.
 */
async function makeReadyPlayer(id: string, opts?: { backend?: 'webaudio' | 'audio-element'; controls?: boolean }): Promise<{
	player: NMMusicPlayer;
	audioEl: HTMLAudioElement;
}> {
	const player = new NMMusicPlayer(id);
	player.setup({ backend: opts?.backend, controls: opts?.controls });

	// Trigger lazy backend init before ready() so the <audio> element exists.
	const backend = player.backend();
	void backend;

	await player.ready();

	const audioEl = player.container.querySelector('audio');
	if (!audioEl)
		throw new Error('AudioElementBackend did not append <audio> to container');

	return { player, audioEl };
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('_wireBackend regression', () => {
	beforeEach(() => {
		(NMMusicPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		const div = document.createElement('div');
		div.id = 'wire-backend-test';
		document.body.appendChild(div);
	});

	afterEach(() => {
		(NMMusicPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		document.body.innerHTML = '';
		removeAudioContext();
	});

	// ── Phase 'starting' → 'playing' ────────────────────────────────────────

	describe('phase transitions to "playing" from backend play event', () => {
		it('transitions "starting" → "playing" when DOM play fires after _firstFrameEmitted is true', async () => {
			const { player, audioEl } = await makeReadyPlayer('wire-backend-test');

			// Simulate canplay during load — sets _firstFrameEmitted = true.
			audioEl.dispatchEvent(new Event('canplay'));

			// Stub element.play() so it resolves without browser-side playback.
			Object.defineProperty(audioEl, 'play', {
				value: vi.fn(() => Promise.resolve()),
				writable: true,
				configurable: true,
			});

			// play() transitions ready → starting.
			await player.play();
			expect(player.phase()).toBe('starting');

			// The backend's DOM bridge emits 'play' when the audio element fires.
			audioEl.dispatchEvent(new Event('play'));

			expect(player.phase()).toBe('playing');
		});

		it('transitions to "playing" even when canplay does NOT re-fire after play()', async () => {
			const { player, audioEl } = await makeReadyPlayer('wire-backend-test');

			// Simulate a load that already fired canplay — _firstFrameEmitted = true.
			audioEl.dispatchEvent(new Event('canplay'));

			Object.defineProperty(audioEl, 'play', {
				value: vi.fn(() => Promise.resolve()),
				writable: true,
				configurable: true,
			});

			await player.play();

			// canplay does NOT fire again (audio was already buffered when play() ran).
			// Only the DOM 'play' event fires.
			audioEl.dispatchEvent(new Event('play'));

			expect(player.phase()).toBe('playing');
		});
	});

	// ── Duration from instance.duration() ────────────────────────────────────

	describe('"duration" event carries value from backend.duration()', () => {
		it('emits "duration" with the audio element\'s duration after loadedmetadata', async () => {
			const { player, audioEl } = await makeReadyPlayer('wire-backend-test');

			let emittedDuration: number | undefined;
			player.on('duration' as never, (data: { duration: number }) => {
				emittedDuration = data.duration;
			});

			// Set the duration on the audio element before firing loadedmetadata.
			Object.defineProperty(audioEl, 'duration', {
				value: 93.5,
				writable: true,
				configurable: true,
			});

			audioEl.dispatchEvent(new Event('loadedmetadata'));

			expect(emittedDuration).toBe(93.5);
		});

		it('does NOT emit "duration" when audio element duration is NaN', async () => {
			const { player, audioEl } = await makeReadyPlayer('wire-backend-test');

			let emitCount = 0;
			player.on('duration' as never, () => { emitCount++; });

			// NaN duration — happens before valid metadata loads.
			Object.defineProperty(audioEl, 'duration', {
				value: Number.NaN,
				writable: true,
				configurable: true,
			});

			audioEl.dispatchEvent(new Event('loadedmetadata'));

			expect(emitCount).toBe(0);
		});
	});

	// ── Backend config 'webaudio' honored on lazy init ───────────────────────

	describe('backend() lazy init respects MusicPlayerConfig.backend', () => {
		it('creates AudioElementBackend by default (no backend config)', () => {
			const player = new NMMusicPlayer('wire-backend-test').setup({});
			expect(player.backend()).toBeInstanceOf(AudioElementBackend);
		});

		it('creates AudioElementBackend when backend config is "audio-element"', () => {
			const player = new NMMusicPlayer('wire-backend-test').setup({ backend: 'audio-element' });
			expect(player.backend()).toBeInstanceOf(AudioElementBackend);
		});

		it('creates WebAudioBackend when backend config is "webaudio"', () => {
			installAudioContext();
			const player = new NMMusicPlayer('wire-backend-test').setup({ backend: 'webaudio' });
			expect(player.backend()).toBeInstanceOf(WebAudioBackend);
		});

		it('backend() getter is idempotent — same instance on repeat calls', () => {
			const player = new NMMusicPlayer('wire-backend-test').setup({});
			const first = player.backend();
			const second = player.backend();
			expect(first).toBe(second);
		});
	});

	// ── Native <audio controls> ──────────────────────────────────────────────

	describe('controls config sets the native controls attribute', () => {
		it('sets audioEl.controls = true when controls: true', async () => {
			const { audioEl } = await makeReadyPlayer('wire-backend-test', { controls: true });
			expect(audioEl.controls).toBe(true);
		});

		it('leaves audioEl.controls = false by default', async () => {
			const { audioEl } = await makeReadyPlayer('wire-backend-test');
			expect(audioEl.controls).toBe(false);
		});

		it('re-applies controls: true after a runtime backend(kind) swap', async () => {
			installAudioContext();
			const { player, audioEl: initialAudioEl } = await makeReadyPlayer('wire-backend-test', { controls: true });
			expect(initialAudioEl.controls).toBe(true);

			await player.backend('webaudio');

			const swappedAudioEl = player.container.querySelector('audio');
			if (!swappedAudioEl)
				throw new Error('WebAudioBackend did not append <audio> to container');
			expect(swappedAudioEl.controls).toBe(true);
		});
	});
});
