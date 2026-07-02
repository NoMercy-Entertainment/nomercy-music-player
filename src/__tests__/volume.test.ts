// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * Volume tests for NMMusicPlayer. Locks the overloaded `volume()` accessor +
 * mute/unmute/toggleMute + volumeUp/Down step contract.
 *
 * `volume()` / `mute()` / `unmute()` dispatch the cancellable `beforeVolume` /
 * `beforeMute` hooks (M1 Connect-plugin effort) and now return `Promise<void>`
 * — tests `await` the setter directly. `volumeUp` / `volumeDown` stay
 * fire-and-forget wrappers (same convention as `seekByPercentage`), so their
 * tests wait a macrotask tick via `flush()` instead.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NMMusicPlayer } from '../index';

/**
 * Flush pending microtasks. `volumeUp()` / `volumeDown()` are fire-and-forget
 * wrappers around the cancellable `volume()` setter — they don't return the
 * underlying promise, so tests exercising them wait a macrotask tick instead
 * of awaiting a return value.
 */
async function flush(): Promise<void> {
	await new Promise(resolve => setTimeout(resolve, 0));
}

describe('NMMusicPlayer — volume', () => {
	beforeEach(() => {
		(NMMusicPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		const div = document.createElement('div');
		div.id = 'test';
		document.body.appendChild(div);
	});

	afterEach(() => {
		(NMMusicPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		document.body.innerHTML = '';
	});

	const setup = (cfg = {}): NMMusicPlayer => new NMMusicPlayer('test').setup(cfg);

	describe('volume()', () => {
		it('returns the default 100 when no defaultVolume is configured', () => {
			expect(setup().volume()).toBe(100);
		});

		it('honors config.defaultVolume', () => {
			expect(setup({ defaultVolume: 40 }).volume()).toBe(40);
		});

		it('round-trips through the writer', async () => {
			const musicPlayer = setup();
			await musicPlayer.volume(50);
			expect(musicPlayer.volume()).toBe(50);
		});

		it('clamps below 0 to 0', async () => {
			const musicPlayer = setup();
			await musicPlayer.volume(-50);
			expect(musicPlayer.volume()).toBe(0);
		});

		it('clamps above 100 to 100', async () => {
			const musicPlayer = setup();
			await musicPlayer.volume(200);
			expect(musicPlayer.volume()).toBe(100);
		});

		it('emits "volume" with the new level', async () => {
			const musicPlayer = setup();
			let level: number | undefined;
			musicPlayer.on('volume' as any, (data: any) => { level = data.level; });
			await musicPlayer.volume(70);
			expect(level).toBe(70);
		});
	});

	describe('mute / unmute', () => {
		it('mute() emits "mute" with muted=true', async () => {
			const musicPlayer = setup();
			let muted: boolean | undefined;
			musicPlayer.on('mute' as any, (data: any) => { muted = data.muted; });
			await musicPlayer.mute();
			expect(muted).toBe(true);
		});

		it('unmute() emits "mute" with muted=false', async () => {
			const musicPlayer = setup();
			await musicPlayer.mute();
			let muted: boolean | undefined;
			musicPlayer.on('mute' as any, (data: any) => { muted = data.muted; });
			await musicPlayer.unmute();
			expect(muted).toBe(false);
		});

		it('mute preserves the previous level so unmute restores it', async () => {
			const musicPlayer = setup();
			await musicPlayer.volume(60);
			await musicPlayer.mute();
			expect(musicPlayer.volume()).toBe(0); // muted reads as 0
			await musicPlayer.unmute();
			expect(musicPlayer.volume()).toBe(60);
		});
	});

	describe('volumeUp / volumeDown', () => {
		it('volumeUp(10) increments by 10', async () => {
			const musicPlayer = setup({ defaultVolume: 50 });
			musicPlayer.volumeUp(10);
			await flush();
			expect(musicPlayer.volume()).toBeCloseTo(60);
		});

		it('volumeDown(20) decrements by 20', async () => {
			const musicPlayer = setup({ defaultVolume: 50 });
			musicPlayer.volumeDown(20);
			await flush();
			expect(musicPlayer.volume()).toBeCloseTo(30);
		});

		it('volumeUp clamps at 100', async () => {
			const musicPlayer = setup({ defaultVolume: 95 });
			musicPlayer.volumeUp(20);
			await flush();
			expect(musicPlayer.volume()).toBe(100);
		});

		it('volumeDown clamps at 0', async () => {
			const musicPlayer = setup({ defaultVolume: 5 });
			musicPlayer.volumeDown(20);
			await flush();
			expect(musicPlayer.volume()).toBe(0);
		});
	});
});
