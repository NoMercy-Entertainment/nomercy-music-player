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
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NMMusicPlayer } from '../index';

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

		it('round-trips through the writer', () => {
			const p = setup();
			p.volume(50);
			expect(p.volume()).toBe(50);
		});

		it('clamps below 0 to 0', () => {
			const p = setup();
			p.volume(-50);
			expect(p.volume()).toBe(0);
		});

		it('clamps above 100 to 100', () => {
			const p = setup();
			p.volume(200);
			expect(p.volume()).toBe(100);
		});

		it('emits "volume" with the new level', () => {
			const p = setup();
			let level: number | undefined;
			p.on('volume' as any, (data: any) => { level = data.level; });
			p.volume(70);
			expect(level).toBe(70);
		});
	});

	describe('mute / unmute', () => {
		it('mute() emits "mute" with muted=true', () => {
			const p = setup();
			let muted: boolean | undefined;
			p.on('mute' as any, (data: any) => { muted = data.muted; });
			p.mute();
			expect(muted).toBe(true);
		});

		it('unmute() emits "mute" with muted=false', () => {
			const p = setup();
			p.mute();
			let muted: boolean | undefined;
			p.on('mute' as any, (data: any) => { muted = data.muted; });
			p.unmute();
			expect(muted).toBe(false);
		});

		it('mute preserves the previous level so unmute restores it', () => {
			const p = setup();
			p.volume(60);
			p.mute();
			expect(p.volume()).toBe(0); // muted reads as 0
			p.unmute();
			expect(p.volume()).toBe(60);
		});
	});

	describe('volumeUp / volumeDown', () => {
		it('volumeUp(10) increments by 10', () => {
			const p = setup({ defaultVolume: 50 });
			p.volumeUp(10);
			expect(p.volume()).toBeCloseTo(60);
		});

		it('volumeDown(20) decrements by 20', () => {
			const p = setup({ defaultVolume: 50 });
			p.volumeDown(20);
			expect(p.volume()).toBeCloseTo(30);
		});

		it('volumeUp clamps at 100', () => {
			const p = setup({ defaultVolume: 95 });
			p.volumeUp(20);
			expect(p.volume()).toBe(100);
		});

		it('volumeDown clamps at 0', () => {
			const p = setup({ defaultVolume: 5 });
			p.volumeDown(20);
			expect(p.volume()).toBe(0);
		});
	});
});
