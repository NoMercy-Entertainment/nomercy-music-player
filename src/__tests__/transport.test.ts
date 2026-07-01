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
			const musicPlayer = setup();
			const result = musicPlayer.play();
			expect(result).toBeInstanceOf(Promise);
		});

		it('emits beforePlay before play', async () => {
			const musicPlayer = setup();
			const order: string[] = [];
			musicPlayer.on('beforePlay' as any, () => order.push('beforePlay'));
			musicPlayer.on('play' as any, () => order.push('play'));
			await musicPlayer.play();
			expect(order).toEqual(['beforePlay', 'play']);
		});

		it('passes a mutable ActionOptions in BeforeEvent.data', async () => {
			const musicPlayer = setup();
			let captured: { source?: string } | undefined;
			musicPlayer.on('beforePlay' as any, (e: any) => { captured = e.data; });
			await musicPlayer.play({ source: 'user' });
			expect(captured?.source).toBe('user');
		});

		it('listener can mutate data, post-event sees mutated value', async () => {
			const musicPlayer = setup();
			let received: { source?: string } | undefined;
			musicPlayer.on('beforePlay' as any, (e: any) => { e.data.source = 'remote'; });
			musicPlayer.on('play' as any, (data: any) => { received = data; });
			await musicPlayer.play({ source: 'user' });
			expect(received?.source).toBe('remote');
		});

		it('preventDefault → emits playPrevented, NOT play', async () => {
			const musicPlayer = setup();
			let playFired = false;
			let preventedReason: string | undefined;
			musicPlayer.on('beforePlay' as any, (e: any) => { e.preventDefault(); });
			musicPlayer.on('play' as any, () => { playFired = true; });
			musicPlayer.on('playPrevented' as any, (data: any) => { preventedReason = data.reason; });
			await musicPlayer.play();
			expect(playFired).toBe(false);
			expect(preventedReason).toBe('listener-prevented');
		});

		it('stopImmediatePropagation skips later listeners on the same event', async () => {
			const musicPlayer = setup();
			const calls: string[] = [];
			musicPlayer.on('beforePlay' as any, (e: any) => { calls.push('first'); e.stopImmediatePropagation(); });
			musicPlayer.on('beforePlay' as any, () => calls.push('second'));
			await musicPlayer.play();
			expect(calls).toEqual(['first']);
		});

		it('stamps "beforePlay" onto dispatching() while listeners run', async () => {
			const musicPlayer = setup();
			let observed: ReadonlyArray<string> | undefined;
			musicPlayer.on('beforePlay' as any, () => { observed = musicPlayer.dispatching(); });
			await musicPlayer.play();
			expect(observed).toEqual(['beforePlay']);
			expect(musicPlayer.dispatching()).toEqual([]);
		});
	});

	describe('pause()', () => {
		it('emits beforePause before pause', async () => {
			const musicPlayer = setup();
			const order: string[] = [];
			musicPlayer.on('beforePause' as any, () => order.push('beforePause'));
			musicPlayer.on('pause' as any, () => order.push('pause'));
			await musicPlayer.pause();
			expect(order).toEqual(['beforePause', 'pause']);
		});

		it('preventDefault → emits pausePrevented, NOT pause', async () => {
			const musicPlayer = setup();
			let pauseFired = false;
			let preventedReason: string | undefined;
			musicPlayer.on('beforePause' as any, (e: any) => { e.preventDefault(); });
			musicPlayer.on('pause' as any, () => { pauseFired = true; });
			musicPlayer.on('pausePrevented' as any, (data: any) => { preventedReason = data.reason; });
			await musicPlayer.pause();
			expect(pauseFired).toBe(false);
			expect(preventedReason).toBe('listener-prevented');
		});
	});

	describe('stop()', () => {
		it('emits beforeStop + stop (cancellable transport pre-event)', async () => {
			const musicPlayer = setup();
			const order: string[] = [];
			musicPlayer.on('beforeStop' as any, () => order.push('beforeStop'));
			musicPlayer.on('stop' as any, () => order.push('stop'));
			await musicPlayer.stop();
			expect(order).toEqual(['beforeStop', 'stop']);
		});
	});

	describe('togglePlayback()', () => {
		it('plays when paused', async () => {
			const musicPlayer = setup();
			let played = false;
			musicPlayer.on('play' as any, () => { played = true; });
			await musicPlayer.togglePlayback();
			expect(played).toBe(true);
		});

		it('pauses after a successful play', async () => {
			const musicPlayer = setup();
			await musicPlayer.togglePlayback(); // play
			let paused = false;
			musicPlayer.on('pause' as any, () => { paused = true; });
			await musicPlayer.togglePlayback(); // pause
			expect(paused).toBe(true);
		});
	});

	describe('restart()', () => {
		it('emits seek to 0 then play', async () => {
			const musicPlayer = setup();
			const order: string[] = [];
			musicPlayer.on('seek' as any, (data: any) => order.push(`seek:${data.time}`));
			musicPlayer.on('play' as any, () => order.push('play'));
			await musicPlayer.restart();
			expect(order).toContain('seek:0');
			expect(order[order.length - 1]).toBe('play');
		});
	});

	describe('rewind() / forward()', () => {
		it('rewind emits beforeSeek with negative delta', () => {
			const musicPlayer = setup();
			let beforeSeekTime: number | undefined;
			musicPlayer.on('beforeSeek' as any, (e: any) => { beforeSeekTime = e.data.time; });
			musicPlayer.rewind(5);
			expect(beforeSeekTime).toBe(-5);
		});

		it('forward emits beforeSeek with positive delta', () => {
			const musicPlayer = setup();
			let beforeSeekTime: number | undefined;
			musicPlayer.on('beforeSeek' as any, (e: any) => { beforeSeekTime = e.data.time; });
			musicPlayer.forward(10);
			expect(beforeSeekTime).toBe(10);
		});
	});

	describe('error spec', () => {
		it('rejects with spec-compliant StateError when called before setup()', async () => {
			const musicPlayer = new NMMusicPlayer('test');
			let err: unknown;
			try { await musicPlayer.pause(); }
			catch (error) { err = error; }
			expect(err).toBeInstanceOf(PlayerError);
			expect(err).toBeInstanceOf(StateError);
			expect((err as PlayerError).code).toBe('core:player/not-ready');
			expect((err as PlayerError).scope).toEqual({ kind: 'core' });
		});
	});
});
