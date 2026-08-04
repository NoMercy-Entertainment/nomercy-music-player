// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * NMMusicPlayer facade residue — the wiring paths not covered by the
 * transport / crossfade / wire-backend suites:
 *
 *  - `backendFactory` config injection (kind forwarding, factory result wins)
 *  - duration fallback to `item.duration` when the backend reports NaN / 0
 *  - the timeupdate bridge (full TimeState payload + itemEndingSoon latch)
 *  - canplay dedupe (one `firstFrame` per load)
 *  - backend `ended` → player `ended` + phase transition
 *  - `beforeDispose` preventDefault keeps the backend + registry entry alive
 *  - crossfadeTo listener-swap re-validation and failure cleanup
 */

import type { MusicPlaylistItem } from '../types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NMMusicPlayer } from '../index';

// ── Mock backend harness ──────────────────────────────────────────────────────

interface BackendHarness {
	backend: Record<string, any>;
	element: HTMLAudioElement;
	fire: (event: string, data?: unknown) => void;
	setCurrentTime: (value: number) => void;
	setDuration: (value: number) => void;
}

function makeBackendHarness(): BackendHarness {
	const element = document.createElement('audio');
	const handlers = new Map<string, Array<(data?: unknown) => void>>();
	let currentTime = 0;
	let duration = 0;

	const backend: Record<string, any> = {
		kind: 'audio-element',
		load: vi.fn(() => Promise.resolve()),
		unload: vi.fn(),
		dispose: vi.fn(),
		play: vi.fn(() => Promise.resolve()),
		pause: vi.fn(),
		stop: vi.fn(),
		currentTime: vi.fn(() => currentTime),
		duration: vi.fn(() => duration),
		buffered: vi.fn(() => 0),
		bufferedRanges: vi.fn(() => ({ length: 0 } as unknown as TimeRanges)),
		seekable: vi.fn(() => ({ length: 0 } as unknown as TimeRanges)),
		playbackRate: vi.fn(() => 1),
		volume: vi.fn(() => 0.8),
		mute: vi.fn(),
		unmute: vi.fn(),
		state: vi.fn(() => 'idle' as const),
		outputNode: vi.fn(() => ({} as AudioNode)),
		analyserSource: vi.fn(() => ({} as AudioNode)),
		mediaElement: vi.fn(() => element),
		captureStream: vi.fn(() => ({} as MediaStream)),
		setSinkId: vi.fn(() => Promise.resolve()),
		getSinkId: vi.fn(() => ''),
		mediaKeys: vi.fn(() => undefined),
		setMediaKeys: vi.fn(() => Promise.resolve()),
		outputProtectionState: vi.fn(() => 'unsupported' as const),
		pauseLoader: vi.fn(),
		resumeLoader: vi.fn(),
		loaderState: vi.fn(() => 'running' as const),
		on: vi.fn((event: string, fn: (data?: unknown) => void) => {
			const list = handlers.get(event) ?? [];
			list.push(fn);
			handlers.set(event, list);
		}),
		off: vi.fn(),
		supportsCrossfade: vi.fn(() => true),
		loadSecondary: vi.fn(() => Promise.resolve()),
		disposeSecondary: vi.fn(),
		primeSecondary: vi.fn(() => Promise.resolve()),
		crossfade: vi.fn(() => Promise.resolve()),
		secondaryGain: vi.fn(() => 0),
	};

	return {
		backend,
		element,
		fire: (event: string, data?: unknown) => {
			for (const fn of handlers.get(event) ?? []) {
				fn(data);
			}
		},
		setCurrentTime: (value: number) => { currentTime = value; },
		setDuration: (value: number) => { duration = value; },
	};
}

function track(id: string, extra?: Partial<MusicPlaylistItem>): MusicPlaylistItem {
	return {
		id,
		name: `track ${id}`,
		url: `blob:${id}`,
		...extra,
	};
}

let idCounter = 0;

interface FacadeSetup {
	player: NMMusicPlayer;
	harness: BackendHarness;
	factorySpy: ReturnType<typeof vi.fn>;
}

async function makePlayer(config: Record<string, unknown> = {}): Promise<FacadeSetup> {
	idCounter += 1;
	const id = `facade-${idCounter}`;
	const div = document.createElement('div');
	div.id = id;
	document.body.appendChild(div);

	const harness = makeBackendHarness();
	const factorySpy = vi.fn(() => harness.backend);
	const player = new NMMusicPlayer(id);
	player.setup({
		backendFactory: factorySpy,
		...config,
	} as any);
	await player.ready();
	player.backend();

	return {
		player,
		harness,
		factorySpy,
	};
}

describe('NMMusicPlayer facade residue', () => {
	beforeEach(() => {
		(NMMusicPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
	});

	afterEach(() => {
		(NMMusicPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		document.body.innerHTML = '';
	});

	// ── backendFactory config injection ───────────────────────────────────────

	describe('backendFactory', () => {
		it('backend() returns the factory-built backend and passes the resolved kind', async () => {
			const { player, harness, factorySpy } = await makePlayer();

			expect(player.backend()).toBe(harness.backend);
			expect(factorySpy).toHaveBeenCalledTimes(1);
			expect(factorySpy.mock.calls[0]![0]).toBe('audio-element');
		});

		it('forwards a configured "webaudio" kind to the factory instead of constructing WebAudioBackend', async () => {
			const { player, harness, factorySpy } = await makePlayer({ backend: 'webaudio' });

			expect(player.backend()).toBe(harness.backend);
			expect(factorySpy.mock.calls[0]![0]).toBe('webaudio');
		});
	});

	// ── duration fallback ─────────────────────────────────────────────────────

	describe('duration fallback on loadedmetadata', () => {
		it('emits the backend duration when it is a positive number', async () => {
			const { player, harness } = await makePlayer();

			const durations: number[] = [];
			player.on('duration' as any, (data: { duration: number }) => { durations.push(data.duration); });

			harness.setDuration(93.5);
			harness.fire('loadedmetadata');

			expect(durations).toEqual([93.5]);
		});

		it('falls back to the item\'s numeric duration when the backend reports 0', async () => {
			const { player, harness } = await makePlayer();

			player.queue([track('a', { duration: 240 })]);

			const durations: number[] = [];
			player.on('duration' as any, (data: { duration: number }) => { durations.push(data.duration); });

			harness.setDuration(0);
			harness.fire('loadedmetadata');

			expect(durations).toEqual([240]);
			expect(player.duration()).toBe(240);
		});

		it('falls back to the item\'s numeric duration when the backend reports NaN', async () => {
			const { player, harness } = await makePlayer();

			player.queue([track('a', { duration: 187 })]);

			const durations: number[] = [];
			player.on('duration' as any, (data: { duration: number }) => { durations.push(data.duration); });

			harness.setDuration(Number.NaN);
			harness.fire('loadedmetadata');

			expect(durations).toEqual([187]);
		});

		it('emits nothing when the item duration is a human-readable string', async () => {
			const { player, harness } = await makePlayer();

			player.queue([track('a', { duration: '3:42' })]);

			let emitCount = 0;
			player.on('duration' as any, () => { emitCount++; });

			harness.setDuration(0);
			harness.fire('loadedmetadata');

			expect(emitCount).toBe(0);
		});

		it('emits nothing when there is no current item to fall back to', async () => {
			const { player, harness } = await makePlayer();

			let emitCount = 0;
			player.on('duration' as any, () => { emitCount++; });

			harness.setDuration(0);
			harness.fire('loadedmetadata');

			expect(emitCount).toBe(0);
		});
	});

	// ── timeupdate bridge ─────────────────────────────────────────────────────

	describe('timeupdate bridge', () => {
		it('emits a full TimeState snapshot built from the backend position', async () => {
			const { player, harness } = await makePlayer();

			harness.setDuration(100);
			harness.fire('loadedmetadata');

			const snapshots: Array<Record<string, number>> = [];
			player.on('time' as any, (data: Record<string, number>) => { snapshots.push(data); });

			harness.setCurrentTime(42);
			harness.fire('timeupdate');

			expect(snapshots).toHaveLength(1);
			expect(snapshots[0]).toMatchObject({
				time: 42,
				position: 42,
				duration: 100,
				remaining: 58,
				percentage: 42,
			});
			expect(player.time()).toBe(42);
		});

		it('fires itemEndingSoon exactly once when the remaining-time threshold is crossed', async () => {
			const { player, harness } = await makePlayer();

			player.queue([track('a'), track('b')]);

			harness.setDuration(100);
			harness.fire('loadedmetadata');

			let endingSoonCount = 0;
			player.on('itemEndingSoon' as any, () => { endingSoonCount++; });

			harness.setCurrentTime(50);
			harness.fire('timeupdate');
			expect(endingSoonCount).toBe(0);

			harness.setCurrentTime(99);
			harness.fire('timeupdate');
			expect(endingSoonCount).toBe(1);

			// The latch holds — further ticks past the threshold do not re-fire.
			harness.setCurrentTime(99.5);
			harness.fire('timeupdate');
			expect(endingSoonCount).toBe(1);
		});
	});

	// ── canplay dedupe + ended bridge ─────────────────────────────────────────

	describe('play-state bridges', () => {
		it('emits firstFrame once even when canplay fires repeatedly', async () => {
			const { player, harness } = await makePlayer();

			let firstFrameCount = 0;
			player.on('firstFrame' as any, () => { firstFrameCount++; });

			harness.fire('canplay');
			harness.fire('canplay');
			harness.fire('canplay');

			expect(firstFrameCount).toBe(1);
		});

		it('bridges backend ended to the player ended event and the "ended" phase', async () => {
			const { player, harness } = await makePlayer();

			player.queue([track('a')]);
			await player.play();
			harness.fire('play');
			expect(player.phase()).toBe('playing');

			let endedCount = 0;
			player.on('ended' as any, () => { endedCount++; });

			harness.fire('ended');

			expect(endedCount).toBe(1);
			expect(player.phase()).toBe('ended');
		});
	});

	// ── dispose prevented ─────────────────────────────────────────────────────

	describe('beforeDispose preventDefault', () => {
		it('keeps the backend, phase, and registry entry fully alive', async () => {
			const { player, harness } = await makePlayer();
			const playerId = player.id;

			player.once('beforeDispose' as any, (event: any) => { event.preventDefault(); });

			const prevented: unknown[] = [];
			player.on('disposePrevented' as any, (data: unknown) => { prevented.push(data); });

			await player.dispose();

			expect(prevented).toHaveLength(1);
			expect(player.phase()).not.toBe('disposed');
			expect(harness.backend['dispose']).not.toHaveBeenCalled();
			expect(player.backend()).toBe(harness.backend);

			// Registry entry survives — constructing with the same id returns the SAME live instance.
			expect(new NMMusicPlayer(playerId)).toBe(player);
		});

		it('a later dispose() without the blocking listener tears everything down', async () => {
			const { player, harness } = await makePlayer();
			const playerId = player.id;

			player.once('beforeDispose' as any, (event: any) => { event.preventDefault(); });
			await player.dispose();
			expect(player.phase()).not.toBe('disposed');

			await player.dispose();

			expect(player.phase()).toBe('disposed');
			expect(harness.backend['dispose']).toHaveBeenCalledTimes(1);

			// Registry slot is free — same id now constructs a fresh instance.
			expect(new NMMusicPlayer(playerId)).not.toBe(player);
		});
	});

	// ── crossfadeTo residue ───────────────────────────────────────────────────

	describe('crossfadeTo residue', () => {
		it('re-validates after a beforeCrossfade listener swaps data.to for a url-less item', async () => {
			const { player, harness } = await makePlayer();

			player.on('beforeCrossfade' as any, (event: any) => {
				event.data.to = {
					id: 'swapped',
					name: 'listener swapped this in',
				};
			});

			await expect(player.crossfadeTo(track('a'))).rejects.toMatchObject({
				code: 'core:media/missing-url',
			});
			expect(harness.backend['loadSecondary']).not.toHaveBeenCalled();
			expect(player.isTransitioning()).toBe(false);
		});

		it('resets isTransitioning() and rethrows when the backend crossfade fails', async () => {
			const { player, harness } = await makePlayer();

			harness.backend['crossfade'].mockRejectedValueOnce(new Error('ramp failed'));

			await expect(player.crossfadeTo(track('a'))).rejects.toThrow('ramp failed');
			expect(player.isTransitioning()).toBe(false);

			// The guard is fully reset — a follow-up crossfade proceeds.
			await player.crossfadeTo(track('b'));
			expect(harness.backend['crossfade']).toHaveBeenCalledTimes(2);
		});
	});

	// ── auth header provider ──────────────────────────────────────────────────

	describe('auth header provider wiring', () => {
		it('resolves a Bearer header from a function-valued bearerToken', async () => {
			idCounter += 1;
			const id = `facade-${idCounter}`;
			const div = document.createElement('div');
			div.id = id;
			document.body.appendChild(div);

			const harness = makeBackendHarness();
			let capturedProvider: (() => Promise<string | undefined>) | undefined;
			harness.backend['setAuthHeaderProvider'] = vi.fn((provider: () => Promise<string | undefined>) => {
				capturedProvider = provider;
			});

			const player = new NMMusicPlayer(id);
			player.setup({
				backendFactory: () => harness.backend,
				auth: { bearerToken: () => Promise.resolve('token-123') },
			} as any);
			await player.ready();
			player.backend();

			expect(capturedProvider).toBeTypeOf('function');
			await expect(capturedProvider!()).resolves.toBe('Bearer token-123');
		});

		it('resolves undefined when no bearer token is configured', async () => {
			idCounter += 1;
			const id = `facade-${idCounter}`;
			const div = document.createElement('div');
			div.id = id;
			document.body.appendChild(div);

			const harness = makeBackendHarness();
			let capturedProvider: (() => Promise<string | undefined>) | undefined;
			harness.backend['setAuthHeaderProvider'] = vi.fn((provider: () => Promise<string | undefined>) => {
				capturedProvider = provider;
			});

			const player = new NMMusicPlayer(id);
			player.setup({ backendFactory: () => harness.backend } as any);
			await player.ready();
			player.backend();

			await expect(capturedProvider!()).resolves.toBeUndefined();
		});
	});
});
