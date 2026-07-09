// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * AutoAdvancePlugin residue — queue exhaustion, repeat-mode interplay,
 * mid-track disable, the addXHandler registration APIs, preloadNext, and
 * crossfade failure containment. Plus the SmartShuffleGenerator paths the
 * generator suite leaves open (singleton/empty queues, previous(), tag sets).
 *
 * The player runs against a factory-injected mock backend so load()/play()
 * resolve deterministically in happy-dom and the REAL queue advancement logic
 * (core next(), repeat handling, queue:exhausted) is what gets exercised.
 */

import type { MusicPlaylistItem } from '../../types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NMMusicPlayer } from '../../index';
import { AutoAdvancePlugin, autoAdvancePlugin, SmartShuffleGenerator } from '../../plugins/auto-advance';
import { RepeatState } from '../../types';

// ── Minimal resolving backend ─────────────────────────────────────────────────

function makeResolvingBackend(): Record<string, any> {
	const element = document.createElement('audio');
	return {
		kind: 'audio-element',
		load: vi.fn(() => Promise.resolve()),
		unload: vi.fn(),
		dispose: vi.fn(),
		play: vi.fn(() => Promise.resolve()),
		pause: vi.fn(),
		stop: vi.fn(),
		currentTime: vi.fn(() => 0),
		duration: vi.fn(() => 0),
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
		on: vi.fn(),
		off: vi.fn(),
		supportsCrossfade: vi.fn(() => true),
		loadSecondary: vi.fn(() => Promise.resolve()),
		disposeSecondary: vi.fn(),
		primeSecondary: vi.fn(() => Promise.resolve()),
		crossfade: vi.fn(() => Promise.resolve()),
		secondaryGain: vi.fn(() => 0),
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

function tick(): Promise<void> {
	return new Promise<void>(resolve => setTimeout(resolve, 0));
}

let idCounter = 0;

async function makePlayerWithPlugin(): Promise<{ player: NMMusicPlayer; plugin: AutoAdvancePlugin }> {
	idCounter += 1;
	const id = `auto-advance-${idCounter}`;
	const div = document.createElement('div');
	div.id = id;
	document.body.appendChild(div);

	const player = new NMMusicPlayer(id);
	player.setup({ backendFactory: () => makeResolvingBackend() } as any);
	player.addPlugin(autoAdvancePlugin);
	await player.ready();
	player.backend();

	const plugin = player.getPlugin(AutoAdvancePlugin);
	if (!plugin)
		throw new Error('AutoAdvancePlugin not registered');
	return {
		player,
		plugin,
	};
}

describe('AutoAdvancePlugin residue', () => {
	beforeEach(() => {
		(NMMusicPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
	});

	afterEach(() => {
		(NMMusicPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		document.body.innerHTML = '';
		vi.restoreAllMocks();
	});

	// ── Queue exhaustion ──────────────────────────────────────────────────────

	describe('queue exhaustion', () => {
		it('ended on the last item emits queue:exhausted and keeps the cursor in place', async () => {
			const { player } = await makePlayerWithPlugin();

			player.queue([track('a'), track('b')]);
			player.item('b');
			await tick();

			let exhaustedCount = 0;
			player.on('queue:exhausted' as any, () => { exhaustedCount++; });

			player.emit('ended' as any, undefined as any);
			await tick();

			expect(exhaustedCount).toBe(1);
			expect(player.index()).toBe(1);
			expect(player.item()?.id).toBe('b');
		});
	});

	// ── Repeat-mode interplay ─────────────────────────────────────────────────

	describe('repeat-mode interplay', () => {
		it('repeat ONE reloads the current item on ended — cursor stays, no exhaustion', async () => {
			const { player } = await makePlayerWithPlugin();

			player.queue([track('a'), track('b')]);
			player.item('b');
			await player.repeatState(RepeatState.ONE);

			let exhaustedCount = 0;
			let nextCount = 0;
			player.on('queue:exhausted' as any, () => { exhaustedCount++; });
			player.on('next' as any, () => { nextCount++; });

			player.emit('ended' as any, undefined as any);
			await tick();

			expect(nextCount).toBe(1);
			expect(exhaustedCount).toBe(0);
			expect(player.index()).toBe(1);
			expect(player.item()?.id).toBe('b');
		});

		it('repeat ALL wraps from the last item back to the first on ended', async () => {
			const { player } = await makePlayerWithPlugin();

			player.queue([track('a'), track('b')]);
			player.item('b');
			await player.repeatState(RepeatState.ALL);

			let exhaustedCount = 0;
			player.on('queue:exhausted' as any, () => { exhaustedCount++; });

			player.emit('ended' as any, undefined as any);
			await tick();

			expect(exhaustedCount).toBe(0);
			expect(player.index()).toBe(0);
			expect(player.item()?.id).toBe('a');
		});
	});

	// ── Mid-track disable ─────────────────────────────────────────────────────

	describe('disable mid-track', () => {
		it('options({ enabled: false }) stops the itemEndingSoon path — no crossfade fires', async () => {
			const { player, plugin } = await makePlayerWithPlugin();

			player.queue([track('a'), track('b')]);
			plugin.options({
				crossfade: true,
				crossfadeDuration: 2,
			});

			const crossfadeSpy = vi.spyOn(player, 'crossfadeTo').mockResolvedValue(undefined);

			plugin.options({ enabled: false });
			player.emit('itemEndingSoon' as any, undefined as any);
			await tick();

			expect(crossfadeSpy).not.toHaveBeenCalled();

			plugin.options({ enabled: true });
			player.emit('itemEndingSoon' as any, undefined as any);
			await tick();

			expect(crossfadeSpy).toHaveBeenCalledTimes(1);
		});
	});

	// ── preloadNext ───────────────────────────────────────────────────────────

	describe('preloadNext()', () => {
		it('loads the peeked next item into the next slot', async () => {
			const { player, plugin } = await makePlayerWithPlugin();

			player.queue([track('a'), track('b')]);

			const loadSpy = vi.spyOn(player, 'load').mockResolvedValue(undefined);
			await plugin.preloadNext();

			expect(loadSpy).toHaveBeenCalledTimes(1);
			const [loadedItem, loadOpts] = loadSpy.mock.calls[0]!;
			expect((loadedItem as MusicPlaylistItem).id).toBe('b');
			expect(loadOpts).toEqual({ slot: 'next' });
		});

		it('no-ops when there is no next item', async () => {
			const { player, plugin } = await makePlayerWithPlugin();

			player.queue([track('a'), track('b')]);
			player.item('b');
			await tick();

			const loadSpy = vi.spyOn(player, 'load').mockResolvedValue(undefined);
			await plugin.preloadNext();

			expect(loadSpy).not.toHaveBeenCalled();
		});

		it('contains a load failure — warns instead of throwing', async () => {
			const { player, plugin } = await makePlayerWithPlugin();

			player.queue([track('a'), track('b')]);
			const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
			vi.spyOn(player, 'load').mockRejectedValue(new Error('network down'));

			await expect(plugin.preloadNext()).resolves.toBeUndefined();

			const flattened = warnSpy.mock.calls.map(args => args.join(' '));
			expect(flattened.some(line => line.includes('preloadNext failed'))).toBe(true);
		});

		it('runs automatically on itemEndingSoon when preloadNextOnEnding is set', async () => {
			const { player, plugin } = await makePlayerWithPlugin();

			player.queue([track('a'), track('b')]);
			plugin.options({ preloadNextOnEnding: true });

			const loadSpy = vi.spyOn(player, 'load').mockResolvedValue(undefined);
			player.emit('itemEndingSoon' as any, undefined as any);
			await tick();

			expect(loadSpy).toHaveBeenCalledTimes(1);
			expect((loadSpy.mock.calls[0]![0] as MusicPlaylistItem).id).toBe('b');
		});
	});

	// ── Handler registration APIs ─────────────────────────────────────────────

	describe('handler registration', () => {
		it('addEndedHandler() handlers run after the built-in advance; a throwing handler is contained', async () => {
			const { player, plugin } = await makePlayerWithPlugin();

			player.queue([track('a'), track('b')]);

			const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
			const seen: string[] = [];
			plugin.addEndedHandler(() => {
				seen.push(`after-advance index=${player.index()}`);
				throw new Error('handler exploded');
			});
			plugin.addEndedHandler(() => {
				seen.push('second handler still runs');
			});

			player.emit('ended' as any, undefined as any);
			await tick();

			expect(seen).toEqual([
				'after-advance index=1',
				'second handler still runs',
			]);
			const flattened = warnSpy.mock.calls.map(args => args.join(' '));
			expect(flattened.some(line => line.includes('ended handler threw'))).toBe(true);
		});

		it('addPreloadHandler() and addCrossfadeHandler() receive the peeked item and duration on itemEndingSoon', async () => {
			const { player, plugin } = await makePlayerWithPlugin();

			player.queue([track('a'), track('b')]);
			plugin.options({ crossfadeDuration: 4 });

			const preloadSeen: Array<string | undefined> = [];
			const crossfadeSeen: Array<{ id: string | undefined; duration: number }> = [];
			plugin.addPreloadHandler((next) => { preloadSeen.push(next?.id as string | undefined); });
			plugin.addCrossfadeHandler((next, duration) => {
				crossfadeSeen.push({
					id: next?.id as string | undefined,
					duration,
				});
			});

			player.emit('itemEndingSoon' as any, undefined as any);
			await tick();

			expect(preloadSeen).toEqual(['b']);
			expect(crossfadeSeen).toEqual([{ id: 'b', duration: 4 }]);
		});

		it('a throwing preload handler is contained and crossfade handlers still run', async () => {
			const { player, plugin } = await makePlayerWithPlugin();

			player.queue([track('a'), track('b')]);

			const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
			plugin.addPreloadHandler(() => {
				throw new Error('preload handler exploded');
			});
			let crossfadeHandlerRan = false;
			plugin.addCrossfadeHandler(() => { crossfadeHandlerRan = true; });

			player.emit('itemEndingSoon' as any, undefined as any);
			await tick();

			expect(crossfadeHandlerRan).toBe(true);
			const flattened = warnSpy.mock.calls.map(args => args.join(' '));
			expect(flattened.some(line => line.includes('preload handler threw'))).toBe(true);
		});

		it('a throwing crossfade handler is contained too', async () => {
			const { player, plugin } = await makePlayerWithPlugin();

			player.queue([track('a'), track('b')]);

			const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
			plugin.addCrossfadeHandler(() => {
				throw new Error('crossfade handler exploded');
			});

			player.emit('itemEndingSoon' as any, undefined as any);
			await tick();

			const flattened = warnSpy.mock.calls.map(args => args.join(' '));
			expect(flattened.some(line => line.includes('crossfade handler threw'))).toBe(true);
		});
	});

	// ── crossfadeTo failure containment ──────────────────────────────────────

	describe('crossfade failure containment', () => {
		it('a rejecting crossfadeTo is warned about, not thrown, and handlers still run', async () => {
			const { player, plugin } = await makePlayerWithPlugin();

			player.queue([track('a'), track('b')]);
			plugin.options({
				crossfade: true,
				crossfadeDuration: 3,
			});

			const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
			vi.spyOn(player, 'crossfadeTo').mockRejectedValue(new Error('fade blew up'));

			let crossfadeHandlerRan = false;
			plugin.addCrossfadeHandler(() => { crossfadeHandlerRan = true; });

			player.emit('itemEndingSoon' as any, undefined as any);
			await tick();

			expect(crossfadeHandlerRan).toBe(true);
			const flattened = warnSpy.mock.calls.map(args => args.join(' '));
			expect(flattened.some(line => line.includes('crossfadeTo failed'))).toBe(true);
		});
	});
});

// ── SmartShuffleGenerator residue ─────────────────────────────────────────────

describe('SmartShuffleGenerator residue', () => {
	function tagged(id: string, extra?: Record<string, unknown>): MusicPlaylistItem {
		return {
			id,
			name: `track ${id}`,
			...extra,
		};
	}

	it('next([]) returns undefined on an empty queue', () => {
		const generator = new SmartShuffleGenerator<MusicPlaylistItem>();
		expect(generator.next([], 0)).toBeUndefined();
	});

	it('next() on a singleton queue returns index 0', () => {
		const generator = new SmartShuffleGenerator<MusicPlaylistItem>();
		expect(generator.next([tagged('only')], 0)).toBe(0);
	});

	it('avoids genre and decade collisions — the untagged-clash-free candidate always wins', () => {
		const generator = new SmartShuffleGenerator<MusicPlaylistItem>();
		const items = [
			tagged('current', { genre: 'rock', decade: 1990 }),
			tagged('clash', { genre: ['rock'], decade: 1990 }),
			tagged('clean', { genre: 'jazz', decade: 2020 }),
		];

		for (let i = 0; i < 25; i++) {
			expect(generator.next(items, 0)).toBe(2);
		}
	});

	it('previous([]) returns undefined on an empty queue', () => {
		const generator = new SmartShuffleGenerator<MusicPlaylistItem>();
		expect(generator.previous([], 0)).toBeUndefined();
	});

	it('previous() pops the internally-tracked play history first', () => {
		const generator = new SmartShuffleGenerator<MusicPlaylistItem>();
		const items = [tagged('a'), tagged('b'), tagged('c')];

		generator.next(items, 0);
		generator.next(items, 1);

		expect(generator.previous(items, 2)).toBe(1);
		expect(generator.previous(items, 1)).toBe(0);
	});

	it('previous() falls back to a random in-range index when no history exists', () => {
		const generator = new SmartShuffleGenerator<MusicPlaylistItem>();
		const items = [tagged('a'), tagged('b'), tagged('c')];

		for (let i = 0; i < 25; i++) {
			const picked = generator.previous(items, 0);
			expect(picked).toBeGreaterThanOrEqual(0);
			expect(picked).toBeLessThan(items.length);
		}
	});
});
