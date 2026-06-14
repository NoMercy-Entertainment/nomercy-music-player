// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * Transport tests for NMMusicPlayer. Locks the cancellable-action contract
 * for play / pause / stop / togglePlayback / next / previous / restart /
 * rewind / forward.
 *
 * Each transport action with a `before*` counterpart MUST:
 *  - Fire the `before*` event with a mutable `BeforeEvent` payload
 *  - Honor `preventDefault()` → emit `<action>Prevented` instead of the action
 *  - Honor `stopImmediatePropagation()` → skip remaining listeners
 *  - Stamp the dispatch onto `player.dispatching()` for plugins to introspect
 *  - When not prevented, fire the action event with the (possibly mutated) data
 *
 * The kit's contract (see `BaseEventMap` in player-core/types) declares which
 * actions are cancellable. Stop is direct (no `beforeStop`). Restart is a
 * compound (time → 0 + play).
 */

import { PlayerError, StateError } from '@nomercy-entertainment/nomercy-player-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NMMusicPlayer } from '../index';

describe('NMMusicPlayer — transport', () => {
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

	describe('play()', () => {
		it('returns a Promise', () => {
			const p = setup();
			const result = p.play();
			expect(result).toBeInstanceOf(Promise);
		});

		it('emits beforePlay before play', async () => {
			const p = setup();
			const order: string[] = [];
			p.on('beforePlay' as any, () => order.push('beforePlay'));
			p.on('play' as any, () => order.push('play'));
			await p.play();
			expect(order).toEqual(['beforePlay', 'play']);
		});

		it('passes a mutable ActionOptions in BeforeEvent.data', async () => {
			const p = setup();
			let captured: { source?: string } | undefined;
			p.on('beforePlay' as any, (e: any) => { captured = e.data; });
			await p.play({ source: 'user' });
			expect(captured?.source).toBe('user');
		});

		it('listener can mutate data, post-event sees mutated value', async () => {
			const p = setup();
			let received: { source?: string } | undefined;
			p.on('beforePlay' as any, (e: any) => { e.data.source = 'remote'; });
			p.on('play' as any, (data: any) => { received = data; });
			await p.play({ source: 'user' });
			expect(received?.source).toBe('remote');
		});

		it('preventDefault → emits playPrevented, NOT play', async () => {
			const p = setup();
			let playFired = false;
			let preventedReason: string | undefined;
			p.on('beforePlay' as any, (e: any) => { e.preventDefault(); });
			p.on('play' as any, () => { playFired = true; });
			p.on('playPrevented' as any, (data: any) => { preventedReason = data.reason; });
			await p.play();
			expect(playFired).toBe(false);
			expect(preventedReason).toBe('listener-prevented');
		});

		it('stopImmediatePropagation skips later listeners on the same event', async () => {
			const p = setup();
			const calls: string[] = [];
			p.on('beforePlay' as any, (e: any) => { calls.push('first'); e.stopImmediatePropagation(); });
			p.on('beforePlay' as any, () => calls.push('second'));
			await p.play();
			expect(calls).toEqual(['first']);
		});

		it('stamps "beforePlay" onto dispatching() while listeners run', async () => {
			const p = setup();
			let observed: ReadonlyArray<string> | undefined;
			p.on('beforePlay' as any, () => { observed = p.dispatching(); });
			await p.play();
			expect(observed).toEqual(['beforePlay']);
			expect(p.dispatching()).toEqual([]);
		});
	});

	describe('pause()', () => {
		it('emits beforePause before pause', async () => {
			const p = setup();
			const order: string[] = [];
			p.on('beforePause' as any, () => order.push('beforePause'));
			p.on('pause' as any, () => order.push('pause'));
			await p.pause();
			expect(order).toEqual(['beforePause', 'pause']);
		});

		it('preventDefault → emits pausePrevented, NOT pause', async () => {
			const p = setup();
			let pauseFired = false;
			let preventedReason: string | undefined;
			p.on('beforePause' as any, (e: any) => { e.preventDefault(); });
			p.on('pause' as any, () => { pauseFired = true; });
			p.on('pausePrevented' as any, (data: any) => { preventedReason = data.reason; });
			await p.pause();
			expect(pauseFired).toBe(false);
			expect(preventedReason).toBe('listener-prevented');
		});
	});

	describe('stop()', () => {
		it('emits beforeStop + stop (cancellable transport pre-event)', async () => {
			const p = setup();
			const order: string[] = [];
			p.on('beforeStop' as any, () => order.push('beforeStop'));
			p.on('stop' as any, () => order.push('stop'));
			await p.stop();
			expect(order).toEqual(['beforeStop', 'stop']);
		});
	});

	describe('togglePlayback()', () => {
		it('plays when paused', async () => {
			const p = setup();
			let played = false;
			p.on('play' as any, () => { played = true; });
			await p.togglePlayback();
			expect(played).toBe(true);
		});

		it('pauses after a successful play', async () => {
			const p = setup();
			await p.togglePlayback(); // play
			let paused = false;
			p.on('pause' as any, () => { paused = true; });
			await p.togglePlayback(); // pause
			expect(paused).toBe(true);
		});
	});

	describe('restart()', () => {
		it('emits seek to 0 then play', async () => {
			const p = setup();
			const order: string[] = [];
			p.on('seek' as any, (data: any) => order.push(`seek:${data.time}`));
			p.on('play' as any, () => order.push('play'));
			await p.restart();
			expect(order).toContain('seek:0');
			expect(order[order.length - 1]).toBe('play');
		});
	});

	describe('rewind() / forward()', () => {
		it('rewind emits beforeSeek with negative delta', () => {
			const p = setup();
			let beforeSeekTime: number | undefined;
			p.on('beforeSeek' as any, (e: any) => { beforeSeekTime = e.data.time; });
			p.rewind(5);
			expect(beforeSeekTime).toBe(-5);
		});

		it('forward emits beforeSeek with positive delta', () => {
			const p = setup();
			let beforeSeekTime: number | undefined;
			p.on('beforeSeek' as any, (e: any) => { beforeSeekTime = e.data.time; });
			p.forward(10);
			expect(beforeSeekTime).toBe(10);
		});
	});

	describe('error spec', () => {
		it('rejects with spec-compliant StateError when called before setup()', async () => {
			const p = new NMMusicPlayer('test');
			let err: unknown;
			try { await p.pause(); }
			catch (e) { err = e; }
			expect(err).toBeInstanceOf(PlayerError);
			expect(err).toBeInstanceOf(StateError);
			expect((err as PlayerError).code).toBe('core:player/not-ready');
			expect((err as PlayerError).scope).toEqual({ kind: 'core' });
		});
	});
});
