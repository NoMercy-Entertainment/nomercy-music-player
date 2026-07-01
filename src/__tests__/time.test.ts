// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * Time / position tests for NMMusicPlayer. Locks the overloaded `time()`
 * accessor and the BeforeSeek contract on the writer path.
 *
 * `time(t)` is the canonical seek API — there is no separate `seek(t)`.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NMMusicPlayer } from '../index';

describe('NMMusicPlayer — time', () => {
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

	const setup = (): NMMusicPlayer => new NMMusicPlayer('test').setup({});

	describe('time() — read', () => {
		it('returns 0 initially', () => {
			expect(setup().time()).toBe(0);
		});
	});

	describe('time(t) — write', () => {
		it('emits beforeSeek with the requested time', () => {
			const musicPlayer = setup();
			let beforeTime: number | undefined;
			musicPlayer.on('beforeSeek' as any, (evt: any) => { beforeTime = evt.data.time; });
			musicPlayer.time(42);
			expect(beforeTime).toBe(42);
		});

		it('updates the read value when not prevented', async () => {
			const musicPlayer = setup();
			await musicPlayer.time(7);
			expect(musicPlayer.time()).toBe(7);
		});

		it('emits seek with the new time', async () => {
			const musicPlayer = setup();
			let seekTime: number | undefined;
			musicPlayer.on('seek' as any, (data: any) => { seekTime = data.time; });
			await musicPlayer.time(15);
			expect(seekTime).toBe(15);
		});

		it('preventDefault → emits seekPrevented, value unchanged', async () => {
			const musicPlayer = setup();
			await musicPlayer.time(10);
			let preventedReason: string | undefined;
			musicPlayer.on('beforeSeek' as any, (evt: any) => { evt.preventDefault(); });
			musicPlayer.on('seekPrevented' as any, (data: any) => { preventedReason = data.reason; });
			await musicPlayer.time(99);
			expect(musicPlayer.time()).toBe(10);
			expect(preventedReason).toBe('listener-prevented');
		});

		it('clamps negative values to 0', () => {
			const musicPlayer = setup();
			musicPlayer.time(-5);
			expect(musicPlayer.time()).toBe(0);
		});
	});

	describe('playbackRate() — read/write', () => {
		it('returns 1 initially', () => {
			expect(setup().playbackRate()).toBe(1);
		});

		it('round-trips through the writer', () => {
			const musicPlayer = setup();
			musicPlayer.playbackRate(1.5);
			expect(musicPlayer.playbackRate()).toBe(1.5);
		});

		it('emits "backend:ratechange" with the new rate', () => {
			const musicPlayer = setup();
			let rate: number | undefined;
			musicPlayer.on('backend:ratechange' as any, (data: any) => { rate = data.rate; });
			musicPlayer.playbackRate(2);
			expect(rate).toBe(2);
		});
	});

	describe('playbackRates()', () => {
		it('returns the standard set of presets', () => {
			const rates = setup().playbackRates();
			expect(Array.isArray(rates)).toBe(true);
			expect(rates).toContain(1);
		});
	});

	describe('duration() / buffered() — defaults', () => {
		it('duration() returns 0 when no track loaded', () => {
			expect(setup().duration()).toBe(0);
		});

		it('buffered() returns 0 when no track loaded', () => {
			expect(setup().buffered()).toBe(0);
		});
	});

	describe('timeData()', () => {
		it('returns the aggregated TimeState shape', async () => {
			const musicPlayer = setup();
			await musicPlayer.time(5);
			const data = musicPlayer.timeData();
			expect(data).toHaveProperty('position');
			expect(data).toHaveProperty('duration');
			expect(data).toHaveProperty('buffered');
			expect(data).toHaveProperty('remaining');
			expect(data).toHaveProperty('percentage');
			expect(data.position).toBe(5);
		});
	});
});
