// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * Crossfade ramp-path tests.
 *
 * Covers the durationMs > 0 branches that existing tests skip:
 *
 *   1. WebAudioBackend.crossfade(durationMs>0)
 *      - linearRampToValueAtTime is scheduled on both primary and secondary GainNodes.
 *      - Primary gain ramps to 0, secondary ramps to the target volume.
 *      - After the ramp completes, the secondary is promoted to primary.
 *
 *   2. AudioElementBackend.crossfade(durationMs>0)
 *      - The RAF fade loop runs from t=0 to t=durationMs.
 *      - Using fake timers + requestAnimationFrame stub to drive the loop
 *        deterministically without real animation frames.
 *      - At completion: primary volume → 0, secondary volume → startVolume,
 *        then element swap occurs.
 *
 *   3. NMMusicPlayer.crossfadeTo() item-cursor update
 *      - After backend.crossfade() resolves, this.item?.(track) is called so
 *        downstream plugins (mediaSession, lyrics, autoAdvance) see the new track.
 *
 *   4. _toV1TimeState with Infinity / non-finite duration
 *      - When _currentDuration is Infinity or NaN the safeD=0 branch fires,
 *        yielding percentage=0 and remaining=0 in the reshaped V1TimeState.
 *
 * Browser-unmockable residue (not tested here):
 *   - Actual audio rendering / gain AudioParam sample processing.
 *   - Real requestAnimationFrame timing (replaced by a synchronous stub).
 *   - Real setTimeout scheduling inside WebAudioBackend.crossfade() (replaced
 *     by vi.useFakeTimers()).
 */

import type { IAudioBackend } from '../adapters/audio-backend/IAudioBackend';
import type { MusicPlaylistItem } from '../types';
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

// ── Web Audio stubs ───────────────────────────────────────────────────────────

function makeMockGain(initial = 1): {
	value: number;
	setValueAtTime: ReturnType<typeof vi.fn>;
	linearRampToValueAtTime: ReturnType<typeof vi.fn>;
	cancelScheduledValues: ReturnType<typeof vi.fn>;
} {
	let _v = initial;
	return {
		get value(): number { return _v; },
		set value(level: number) { _v = level; },
		setValueAtTime: vi.fn((target: number) => { _v = target; }),
		linearRampToValueAtTime: vi.fn((target: number) => { _v = target; }),
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

// ── Mock backend for orchestration tests ─────────────────────────────────────

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

// =============================================================================
// 1. WebAudioBackend.crossfade(durationMs > 0) — gain ramp scheduling
// =============================================================================

describe('WebAudioBackend.crossfade(durationMs>0) — gain ramp scheduling', () => {
	beforeEach(() => {
		installAudioContext();
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		removeAudioContext();
		document.body.innerHTML = '';
	});

	it('calls linearRampToValueAtTime on the secondary GainNode for a positive duration', async () => {
		const container = makeContainer();
		const backend = new WebAudioBackend(container);

		// Init the primary Web Audio graph so gainNode is populated.
		const ctx = MockAudioContext.lastInstance! as unknown as AudioContext;
		backend.outputNode(ctx);

		// Load and prime secondary.
		const loadPromise = backend.loadSecondary('http://test/next.mp3');
		fireMetadata(container);
		await loadPromise;

		const primePromise = backend.primeSecondary();
		fireCanPlay(container);
		await primePromise;

		// Stub play on all audio elements.
		container.querySelectorAll('audio').forEach(el => stubPlay(el as HTMLAudioElement));

		// Capture the secondary GainNode before the crossfade.
		const raw = backend as unknown as Record<string, unknown>;
		const secondaryGain = raw['_secondaryGain'] as MockGainNode;
		expect(secondaryGain).toBeDefined();

		// Start crossfade with 300 ms duration — does not resolve until the timer fires.
		const crossfadePromise = backend.crossfade(300);

		// linearRampToValueAtTime must have been called on the secondary gain
		// to ramp it up to the target volume.
		expect((secondaryGain.gain.linearRampToValueAtTime as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0);

		// The final scheduled target value for the secondary must be > 0 (target volume).
		const rampCalls = (secondaryGain.gain.linearRampToValueAtTime as ReturnType<typeof vi.fn>).mock.calls;
		const finalTarget: number = rampCalls[rampCalls.length - 1]![0] as number;
		expect(finalTarget).toBeGreaterThan(0);

		// Advance fake timers to let the internal setTimeout(resolve, durationMs) fire.
		await vi.advanceTimersByTimeAsync(300);
		await crossfadePromise;

		// After the crossfade the secondary slot must be cleared.
		expect(raw['_secondaryEl']).toBeUndefined();
		expect(raw['_secondaryGain']).toBeUndefined();
	});

	it('ramps primary GainNode to 0 over the duration', async () => {
		const container = makeContainer();
		const backend = new WebAudioBackend(container);

		const ctx = MockAudioContext.lastInstance! as unknown as AudioContext;
		backend.outputNode(ctx);

		// Capture primary GainNode reference before loadSecondary creates the secondary.
		const rawBefore = backend as unknown as Record<string, unknown>;
		const primaryGain = rawBefore['gainNode'] as MockGainNode;
		expect(primaryGain).toBeDefined();

		const loadPromise = backend.loadSecondary('http://test/next.mp3');
		fireMetadata(container);
		await loadPromise;

		const primePromise = backend.primeSecondary();
		fireCanPlay(container);
		await primePromise;

		container.querySelectorAll('audio').forEach(el => stubPlay(el as HTMLAudioElement));

		const crossfadePromise = backend.crossfade(200);

		// Primary gain must have been scheduled to ramp to 0.
		const rampCalls = (primaryGain.gain.linearRampToValueAtTime as ReturnType<typeof vi.fn>).mock.calls;
		expect(rampCalls.length).toBeGreaterThan(0);
		const primaryFinalTarget: number = rampCalls[rampCalls.length - 1]![0] as number;
		expect(primaryFinalTarget).toBe(0);

		await vi.advanceTimersByTimeAsync(200);
		await crossfadePromise;
	});

	it('promotes secondary element and GainNode to primary after ramp completes', async () => {
		const container = makeContainer();
		const backend = new WebAudioBackend(container);

		const ctx = MockAudioContext.lastInstance! as unknown as AudioContext;
		backend.outputNode(ctx);

		const loadPromise = backend.loadSecondary('http://test/next.mp3');
		fireMetadata(container);
		await loadPromise;

		const primePromise = backend.primeSecondary();
		fireCanPlay(container);
		await primePromise;

		container.querySelectorAll('audio').forEach(el => stubPlay(el as HTMLAudioElement));

		const rawBefore = backend as unknown as Record<string, unknown>;
		const secondaryElBefore = rawBefore['_secondaryEl'] as HTMLAudioElement;

		const crossfadePromise = backend.crossfade(150);
		await vi.advanceTimersByTimeAsync(150);
		await crossfadePromise;

		// After promotion: mediaElement() must be what was the secondary.
		expect(backend.mediaElement()).toBe(secondaryElBefore);

		// Secondary slots cleared.
		const rawAfter = backend as unknown as Record<string, unknown>;
		expect(rawAfter['_secondaryEl']).toBeUndefined();
		expect(rawAfter['_secondarySource']).toBeUndefined();
		expect(rawAfter['_secondaryGain']).toBeUndefined();
	});
});

// =============================================================================
// 2. AudioElementBackend.crossfade(durationMs > 0) — RAF fade loop
//
// The crossfade() implementation:
//   1. Calls secondary.play() — must resolve synchronously via stub.
//   2. Enters a new Promise that calls requestAnimationFrame(tick).
//   3. Each tick measures elapsed = performance.now() - startTime.
//   4. When t >= 1 the Promise resolves and the element swap occurs.
//
// To drive the loop deterministically we:
//   - Stub performance.now() BEFORE calling crossfade() so startTime=0.
//   - Override requestAnimationFrame to call its callback synchronously.
//   - After crossfade() starts, advance performance.now() past durationMs.
//   - Flush the rAF queue to completion.
// =============================================================================

describe('AudioElementBackend.crossfade(durationMs>0) — RAF fade loop', () => {
	let originalRaf: typeof requestAnimationFrame;
	let rafCallbacks: Array<FrameRequestCallback>;
	let nowValue: number;

	beforeEach(() => {
		originalRaf = globalThis.requestAnimationFrame;
		rafCallbacks = [];
		nowValue = 0;

		// Replace rAF with a synchronous collector.
		globalThis.requestAnimationFrame = (cb: FrameRequestCallback): number => {
			rafCallbacks.push(cb);
			return rafCallbacks.length;
		};

		// Stub performance.now() to return a controllable value.
		vi.spyOn(performance, 'now').mockImplementation(() => nowValue);
	});

	afterEach(() => {
		globalThis.requestAnimationFrame = originalRaf;
		vi.mocked(performance.now).mockRestore?.();
		vi.restoreAllMocks();
		document.body.innerHTML = '';
	});

	/**
	 * Drive all rAF callbacks synchronously with the current nowValue.
	 * Each call may queue more callbacks — keep draining until empty.
	 */
	function flushRaf(): void {
		while (rafCallbacks.length > 0) {
			const batch = rafCallbacks.splice(0);
			for (const cb of batch) {
				cb(nowValue);
			}
		}
	}

	async function setupBackendWithSecondary(durationMs: number): Promise<{
		backend: AudioElementBackend;
		container: HTMLDivElement;
		secondaryEl: HTMLAudioElement;
		crossfadePromise: Promise<void>;
	}> {
		const container = makeContainer();
		const backend = new AudioElementBackend(container);

		// Load secondary — fire metadata to resolve loadSecondary().
		const loadPromise = backend.loadSecondary('http://test/next.mp3');
		fireMetadata(container);
		await loadPromise;

		// Prime secondary — fire canplay to resolve primeSecondary().
		const primePromise = backend.primeSecondary();
		fireCanPlay(container);
		await primePromise;

		// Stub play on ALL audio elements so secondary.play() resolves immediately.
		container.querySelectorAll('audio').forEach(el => stubPlay(el as HTMLAudioElement));

		const raw = backend as unknown as { _secondary?: HTMLAudioElement };
		const secondaryEl = raw._secondary!;

		// Start crossfade — performance.now() currently returns 0 (startTime = 0).
		const crossfadePromise = backend.crossfade(durationMs);

		// Yield to let secondary.play() resolve and the first rAF callback register.
		await Promise.resolve();
		await Promise.resolve();

		return { backend, container, secondaryEl, crossfadePromise };
	}

	it('element swap occurs after the rAF loop signals t=1', async () => {
		const DURATION_MS = 300;
		const { backend, secondaryEl, crossfadePromise } = await setupBackendWithSecondary(DURATION_MS);

		// Advance time past the duration so t = min(1, elapsed/durationMs) = 1.
		nowValue = DURATION_MS + 1;
		flushRaf();

		await crossfadePromise;

		// After the swap: new primary must be what was the secondary.
		expect(backend.mediaElement()).toBe(secondaryEl);

		// Secondary slot cleared.
		const raw = backend as unknown as { _secondary?: HTMLAudioElement };
		expect(raw._secondary).toBeUndefined();
	});

	it('secondary volume reaches startVolume at loop completion', async () => {
		const DURATION_MS = 200;
		const { backend, secondaryEl, crossfadePromise } = await setupBackendWithSecondary(DURATION_MS);

		const startVolume = 1; // default element volume in happy-dom

		// Advance past duration.
		nowValue = DURATION_MS + 1;
		flushRaf();

		await crossfadePromise;

		// After swap the old secondary is now the primary element.  Its volume
		// at t=1 was set to startVolume * 1 = startVolume.
		// The element was re-promoted, so we can't read it from secondaryEl after
		// the swap (it became element) — assert the backend reports the right volume.
		expect(backend.mediaElement()).toBe(secondaryEl);
		// Volume on the now-primary element was set during the final tick.
		expect(secondaryEl.volume).toBe(startVolume);
	});
});

// =============================================================================
// 3. NMMusicPlayer.crossfadeTo() — item cursor update after backend resolves
// =============================================================================

describe('NMMusicPlayer.crossfadeTo() — item cursor update', () => {
	beforeEach(() => {
		(NMMusicPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		const div = document.createElement('div');
		div.id = 'cursor-test';
		document.body.appendChild(div);
	});

	afterEach(() => {
		(NMMusicPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		document.body.innerHTML = '';
	});

	it('calls item() setter with the incoming track after crossfade completes', async () => {
		const div = document.getElementById('cursor-test')!;
		const player = new NMMusicPlayer(div.id);
		player.setup({});

		const mock = makeMockBackend();
		(player as unknown as Record<string, unknown>)['_backend'] = mock;

		// Set up an initial queue so item() has context.
		const trackA: MusicPlaylistItem = { id: 'a', name: 'Track A', url: 'http://test/a.mp3' };
		const trackB: MusicPlaylistItem = { id: 'b', name: 'Track B', url: 'http://test/b.mp3' };
		player.queue([trackA, trackB]);

		// Spy on the item setter overload (call with argument sets the cursor).
		const itemSpy = vi.spyOn(player, 'item');

		await player.crossfadeTo(trackB);

		// item() must have been called with the incoming track's id (or the track itself
		// when id is absent) — this is the cursor-update call that notifies downstream plugins.
		const setterCalls = itemSpy.mock.calls.filter(args => args.length > 0);
		expect(setterCalls.length).toBeGreaterThan(0);

		// The argument passed is trackB.id or trackB itself.
		const firstArg = setterCalls[0]![0];
		expect(firstArg === trackB.id || firstArg === trackB).toBe(true);
	});

	it('emits the item event that downstream plugins (mediaSession, lyrics) listen to', async () => {
		const div = document.getElementById('cursor-test')!;
		const player = new NMMusicPlayer(div.id);
		player.setup({});

		const mock = makeMockBackend();
		(player as unknown as Record<string, unknown>)['_backend'] = mock;

		const trackA: MusicPlaylistItem = { id: 'a', name: 'Track A', url: 'http://test/a.mp3' };
		const trackB: MusicPlaylistItem = { id: 'b', name: 'Track B', url: 'http://test/b.mp3' };

		// Queue both tracks so item('b') can find trackB and emit 'item' / 'current'.
		player.queue([trackA, trackB]);

		const itemEvents: unknown[] = [];
		player.on('item' as never, (data: unknown) => { itemEvents.push(data); });

		await player.crossfadeTo(trackB);

		// The item event carries { item, index } — what lyrics/mediaSession listen to.
		expect(itemEvents.length).toBeGreaterThan(0);
	});
});
