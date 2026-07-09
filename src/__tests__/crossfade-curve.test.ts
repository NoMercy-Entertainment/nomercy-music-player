// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * Crossfade curve routing + the supportsCrossfade() gate.
 *
 * Curve routing — `crossfadeTo(item, { curve })` forwards the resolved curve
 * to `IAudioBackend.crossfade(durationMs, curve)`:
 *   - per-call `opts.curve` wins over `crossfadeDefaults.curve`, which wins
 *     over the linear default (no curve resolved → the argument stays
 *     undefined and backends ramp linearly, identical to the old behavior).
 *   - AudioElementBackend shapes its RAF fade loop with the constant-power
 *     cosine — both volumes pass ≈ 0.707 × start volume at the midpoint
 *     instead of the linear 0.5.
 *   - WebAudioBackend schedules the same trajectory via `setValueCurveAtTime`;
 *     linear / omitted keeps the `linearRampToValueAtTime` path.
 *
 * Gate — a backend whose `supportsCrossfade()` returns `false` makes
 * `crossfadeTo()` throw `StateError('core:player/crossfade-unsupported')`
 * before `beforeCrossfade` dispatch and before any buffer is touched.
 */

import type { CrossfadeCurve, IAudioBackend } from '../adapters/audio-backend/IAudioBackend';
import type { MusicPlayerConfig, MusicPlaylistItem } from '../types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioElementBackend } from '../adapters/audio-backend/html5-audio';
import { WebAudioBackend } from '../adapters/audio-backend/web-audio';
import { NMMusicPlayer } from '../index';

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

function stubPlay(el: HTMLAudioElement): void {
	Object.defineProperty(el, 'play', {
		value: vi.fn(() => Promise.resolve()),
		writable: true,
		configurable: true,
	});
}

// ── Web Audio stubs (established class-based pattern) ─────────────────────────

function makeMockGain(initial = 1): {
	value: number;
	setValueAtTime: ReturnType<typeof vi.fn>;
	linearRampToValueAtTime: ReturnType<typeof vi.fn>;
	setValueCurveAtTime: ReturnType<typeof vi.fn>;
	setTargetAtTime: ReturnType<typeof vi.fn>;
	cancelScheduledValues: ReturnType<typeof vi.fn>;
} {
	let level = initial;
	return {
		get value(): number { return level; },
		set value(next: number) { level = next; },
		setValueAtTime: vi.fn((target: number) => { level = target; }),
		linearRampToValueAtTime: vi.fn((target: number) => { level = target; }),
		setValueCurveAtTime: vi.fn((curve: Float32Array) => { level = curve[curve.length - 1]!; }),
		setTargetAtTime: vi.fn((target: number) => { level = target; }),
		cancelScheduledValues: vi.fn(),
	};
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
	(globalThis as unknown as { AudioContext: typeof MockAudioContext }).AudioContext = MockAudioContext;
	MockAudioContext.lastInstance = null;
}

function removeAudioContext(): void {
	delete (globalThis as unknown as { AudioContext?: unknown }).AudioContext;
	MockAudioContext.lastInstance = null;
}

// ── Mock backend for facade routing tests ─────────────────────────────────────

function makeMockBackend(overrides: Partial<IAudioBackend> = {}): IAudioBackend {
	return {
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
		supportsCrossfade: vi.fn(() => true),
		loadSecondary: vi.fn(() => Promise.resolve()),
		disposeSecondary: vi.fn(),
		primeSecondary: vi.fn(() => Promise.resolve()),
		crossfade: vi.fn(() => Promise.resolve()),
		secondaryGain: vi.fn(() => 0) as IAudioBackend['secondaryGain'],
		...overrides,
	};
}

function makeTrack(url = 'http://test/track.mp3'): MusicPlaylistItem {
	return { id: '1', name: 'Test Track', url };
}

let idCounter = 0;

function setupPlayer(
	config: MusicPlayerConfig = {},
	backendOverrides: Partial<IAudioBackend> = {},
): { player: NMMusicPlayer; mock: IAudioBackend } {
	idCounter += 1;
	const div = document.createElement('div');
	div.id = `curve-test-${idCounter}`;
	document.body.appendChild(div);

	const player = new NMMusicPlayer(div.id);
	player.setup(config);

	const mock = makeMockBackend(backendOverrides);
	(player as unknown as { _backend?: IAudioBackend })._backend = mock;

	return { player, mock };
}

// =============================================================================
// 1. Facade routing — crossfadeTo() resolves and forwards the curve
// =============================================================================

describe('NMMusicPlayer.crossfadeTo() — curve resolution', () => {
	beforeEach(() => {
		(NMMusicPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
	});

	afterEach(() => {
		(NMMusicPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		document.body.innerHTML = '';
	});

	it('forwards the per-call curve to backend.crossfade', async () => {
		const { player, mock } = setupPlayer();

		await player.crossfadeTo(makeTrack(), { duration: 3, curve: 'equal-power' });

		expect(mock.crossfade).toHaveBeenCalledWith(3000, 'equal-power');
	});

	it('falls back to crossfadeDefaults.curve from the config', async () => {
		const { player, mock } = setupPlayer({ crossfadeDefaults: { duration: 7, curve: 'equal-power' } });

		await player.crossfadeTo(makeTrack());

		expect(mock.crossfade).toHaveBeenCalledWith(7000, 'equal-power');
	});

	it('per-call curve wins over the config default', async () => {
		const { player, mock } = setupPlayer({ crossfadeDefaults: { duration: 7, curve: 'equal-power' } });

		await player.crossfadeTo(makeTrack(), { duration: 3, curve: 'linear' });

		expect(mock.crossfade).toHaveBeenCalledWith(3000, 'linear');
	});

	it('omits the curve argument entirely when neither the call nor the config declares one', async () => {
		const { player, mock } = setupPlayer();

		await player.crossfadeTo(makeTrack(), { duration: 3 });

		const call = (mock.crossfade as ReturnType<typeof vi.fn>).mock.calls[0]!;
		expect(call).toHaveLength(1);
		expect(call[0]).toBe(3000);
	});
});

// =============================================================================
// 2. supportsCrossfade() gate
// =============================================================================

describe('NMMusicPlayer.crossfadeTo() — supportsCrossfade() gate', () => {
	beforeEach(() => {
		(NMMusicPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
	});

	afterEach(() => {
		(NMMusicPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		document.body.innerHTML = '';
	});

	it('throws StateError core:player/crossfade-unsupported when the backend cannot crossfade', async () => {
		const { player, mock } = setupPlayer({}, { supportsCrossfade: vi.fn(() => false) });

		await expect(player.crossfadeTo(makeTrack())).rejects.toMatchObject({
			name: 'StateError',
			code: 'core:player/crossfade-unsupported',
		});

		expect(mock.loadSecondary).not.toHaveBeenCalled();
		expect(mock.primeSecondary).not.toHaveBeenCalled();
		expect(mock.crossfade).not.toHaveBeenCalled();
		expect(player.isTransitioning()).toBe(false);
	});

	it('rejects before beforeCrossfade dispatch — no crossfade events fire', async () => {
		const { player } = setupPlayer({}, { supportsCrossfade: vi.fn(() => false) });

		const events: string[] = [];
		player.on('beforeCrossfade', () => { events.push('beforeCrossfade'); });
		player.on('crossfadeStart', () => { events.push('crossfadeStart'); });
		player.on('crossfadePrevented', () => { events.push('crossfadePrevented'); });

		await expect(player.crossfadeTo(makeTrack())).rejects.toThrow();

		expect(events).toEqual([]);
	});

	it('a missing item.url is still validated before the capability gate', async () => {
		const { player } = setupPlayer({}, { supportsCrossfade: vi.fn(() => false) });
		const trackNoUrl = { id: 'x', name: 'No URL' } as MusicPlaylistItem;

		await expect(player.crossfadeTo(trackNoUrl)).rejects.toMatchObject({
			code: 'core:media/missing-url',
		});
	});
});

// =============================================================================
// 3. AudioElementBackend — curve-shaped RAF fade loop
// =============================================================================

describe('AudioElementBackend.crossfade() — curve-shaped RAF loop', () => {
	let originalRaf: typeof requestAnimationFrame;
	let rafCallbacks: Array<FrameRequestCallback>;
	let nowValue: number;

	beforeEach(() => {
		originalRaf = globalThis.requestAnimationFrame;
		rafCallbacks = [];
		nowValue = 0;

		globalThis.requestAnimationFrame = (cb: FrameRequestCallback): number => {
			rafCallbacks.push(cb);
			return rafCallbacks.length;
		};

		vi.spyOn(performance, 'now').mockImplementation(() => nowValue);
	});

	afterEach(() => {
		globalThis.requestAnimationFrame = originalRaf;
		vi.restoreAllMocks();
		document.body.innerHTML = '';
	});

	/** Run the currently queued rAF callbacks exactly once — mid-fade sampling. */
	function runOneRafBatch(): void {
		const batch = rafCallbacks.splice(0);
		for (const cb of batch) {
			cb(nowValue);
		}
	}

	function flushRaf(): void {
		while (rafCallbacks.length > 0) {
			runOneRafBatch();
		}
	}

	async function startCrossfade(durationMs: number, curve?: CrossfadeCurve): Promise<{
		backend: AudioElementBackend;
		primaryEl: HTMLAudioElement;
		secondaryEl: HTMLAudioElement;
		crossfadePromise: Promise<void>;
	}> {
		const container = makeContainer();
		const backend = new AudioElementBackend(container);

		const loadPromise = backend.loadSecondary('http://test/next.mp3');
		fireMetadata(container);
		await loadPromise;

		const primePromise = backend.primeSecondary();
		fireCanPlay(container);
		await primePromise;

		container.querySelectorAll('audio').forEach(el => stubPlay(el as HTMLAudioElement));

		const primaryEl = backend.mediaElement();
		const secondaryEl = (backend as unknown as { _secondary?: HTMLAudioElement })._secondary!;

		const crossfadePromise = backend.crossfade(durationMs, curve);

		// Yield to let secondary.play() resolve and the first rAF callback register.
		await Promise.resolve();
		await Promise.resolve();

		return { backend, primaryEl, secondaryEl, crossfadePromise };
	}

	it('equal-power puts both volumes at ≈ 0.707 × start at the midpoint — not the linear 0.5', async () => {
		const { primaryEl, secondaryEl, crossfadePromise } = await startCrossfade(300, 'equal-power');

		nowValue = 150;
		runOneRafBatch();

		expect(secondaryEl.volume).toBeCloseTo(Math.SQRT1_2, 3);
		expect(primaryEl.volume).toBeCloseTo(Math.SQRT1_2, 3);

		nowValue = 301;
		flushRaf();
		await crossfadePromise;
	});

	it('omitted curve keeps the linear midpoint at exactly 0.5', async () => {
		const { primaryEl, secondaryEl, crossfadePromise } = await startCrossfade(300);

		nowValue = 150;
		runOneRafBatch();

		expect(secondaryEl.volume).toBeCloseTo(0.5, 6);
		expect(primaryEl.volume).toBeCloseTo(0.5, 6);

		nowValue = 301;
		flushRaf();
		await crossfadePromise;
	});

	it('equal-power completes at full incoming volume and swaps the elements', async () => {
		const { backend, secondaryEl, crossfadePromise } = await startCrossfade(200, 'equal-power');

		nowValue = 201;
		flushRaf();
		await crossfadePromise;

		expect(backend.mediaElement()).toBe(secondaryEl);
		expect(secondaryEl.volume).toBe(1);
	});
});

// =============================================================================
// 4. WebAudioBackend — curve scheduling on the GainNodes
// =============================================================================

describe('WebAudioBackend.crossfade() — curve scheduling', () => {
	beforeEach(() => {
		installAudioContext();
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		removeAudioContext();
		document.body.innerHTML = '';
	});

	async function primeBackend(): Promise<{
		backend: WebAudioBackend;
		primaryGain: MockGainNode;
		secondaryGain: MockGainNode;
	}> {
		const container = makeContainer();
		const backend = new WebAudioBackend(container);

		const ctx = MockAudioContext.lastInstance! as unknown as AudioContext;
		backend.outputNode(ctx);

		const raw = backend as unknown as Record<string, unknown>;
		const primaryGain = raw['gainNode'] as MockGainNode;

		const loadPromise = backend.loadSecondary('http://test/next.mp3');
		fireMetadata(container);
		await loadPromise;

		const primePromise = backend.primeSecondary();
		fireCanPlay(container);
		await primePromise;

		container.querySelectorAll('audio').forEach(el => stubPlay(el as HTMLAudioElement));

		const secondaryGain = raw['_secondaryGain'] as MockGainNode;
		return { backend, primaryGain, secondaryGain };
	}

	it('equal-power schedules setValueCurveAtTime with the constant-power trajectory (midpoint ≈ 0.707)', async () => {
		const { backend, primaryGain, secondaryGain } = await primeBackend();

		const crossfadePromise = backend.crossfade(300, 'equal-power');

		const upCall = (secondaryGain.gain.setValueCurveAtTime as ReturnType<typeof vi.fn>).mock.calls[0]!;
		const upCurve = upCall[0] as Float32Array;
		const midIndex = (upCurve.length - 1) / 2;
		expect(upCurve[0]!).toBeCloseTo(0, 5);
		expect(upCurve[upCurve.length - 1]!).toBeCloseTo(1, 5);
		expect(upCurve[midIndex]!).toBeCloseTo(Math.SQRT1_2, 3);
		expect(upCall[2]).toBeCloseTo(0.3, 6);

		const downCall = (primaryGain.gain.setValueCurveAtTime as ReturnType<typeof vi.fn>).mock.calls[0]!;
		const downCurve = downCall[0] as Float32Array;
		expect(downCurve[0]!).toBeCloseTo(1, 5);
		expect(downCurve[downCurve.length - 1]!).toBeCloseTo(0, 5);
		expect(downCurve[midIndex]!).toBeCloseTo(Math.SQRT1_2, 3);

		expect(secondaryGain.gain.linearRampToValueAtTime).not.toHaveBeenCalled();
		expect(primaryGain.gain.linearRampToValueAtTime).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(300);
		await crossfadePromise;

		expect((backend as unknown as Record<string, unknown>)['_secondaryGain']).toBeUndefined();
	});

	it('omitted curve keeps the linearRampToValueAtTime path — setValueCurveAtTime untouched', async () => {
		const { backend, primaryGain, secondaryGain } = await primeBackend();

		const crossfadePromise = backend.crossfade(300);

		expect(secondaryGain.gain.linearRampToValueAtTime).toHaveBeenCalled();
		expect(primaryGain.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0, expect.any(Number));
		expect(secondaryGain.gain.setValueCurveAtTime).not.toHaveBeenCalled();
		expect(primaryGain.gain.setValueCurveAtTime).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(300);
		await crossfadePromise;
	});

	it('explicit linear curve resolves to the linear ramp path too', async () => {
		const { backend, primaryGain, secondaryGain } = await primeBackend();

		const crossfadePromise = backend.crossfade(300, 'linear');

		expect(secondaryGain.gain.linearRampToValueAtTime).toHaveBeenCalled();
		expect(secondaryGain.gain.setValueCurveAtTime).not.toHaveBeenCalled();
		expect(primaryGain.gain.setValueCurveAtTime).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(300);
		await crossfadePromise;
	});
});
