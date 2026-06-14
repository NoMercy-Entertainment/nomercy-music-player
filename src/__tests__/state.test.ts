// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * State-enum tests for NMMusicPlayer. Locks the API convention:
 * `xxxState()` returns the enum value; `xxxState(value)` writes it (where
 * the spec allows write).
 *
 * Stateful = overloaded function.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NMMusicPlayer } from '../index';
import { PlayState, RepeatState, ShuffleState, VolumeState } from '../types';

describe('NMMusicPlayer — state enums', () => {
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

	describe('playState()', () => {
		it('returns IDLE before any transport action', () => {
			expect(setup().playState()).toBe(PlayState.IDLE);
		});

		it('transitions to PLAYING after play()', async () => {
			const p = setup();
			await p.play();
			expect(p.playState()).toBe(PlayState.PLAYING);
		});

		it('transitions to PAUSED after pause()', async () => {
			const p = setup();
			await p.play();
			await p.pause();
			expect(p.playState()).toBe(PlayState.PAUSED);
		});

		it('transitions to STOPPED after stop()', async () => {
			const p = setup();
			await p.play();
			await p.stop();
			expect(p.playState()).toBe(PlayState.STOPPED);
		});
	});

	describe('volumeState()', () => {
		it('returns UNMUTED initially', () => {
			expect(setup().volumeState()).toBe(VolumeState.UNMUTED);
		});

		it('transitions to MUTED after mute()', () => {
			const p = setup();
			p.mute();
			expect(p.volumeState()).toBe(VolumeState.MUTED);
		});

		it('transitions back to UNMUTED after unmute()', () => {
			const p = setup();
			p.mute();
			p.unmute();
			expect(p.volumeState()).toBe(VolumeState.UNMUTED);
		});

		it('toggleMute flips state', () => {
			const p = setup();
			p.toggleMute();
			expect(p.volumeState()).toBe(VolumeState.MUTED);
			p.toggleMute();
			expect(p.volumeState()).toBe(VolumeState.UNMUTED);
		});
	});

	describe('repeatState() — overloaded read/write', () => {
		it('returns OFF initially', () => {
			expect(setup().repeatState()).toBe(RepeatState.OFF);
		});

		it('round-trips through the writer', () => {
			const p = setup();
			p.repeatState(RepeatState.ALL);
			expect(p.repeatState()).toBe(RepeatState.ALL);
			p.repeatState(RepeatState.ONE);
			expect(p.repeatState()).toBe(RepeatState.ONE);
		});
	});

	describe('shuffleState() — overloaded read/write', () => {
		it('returns OFF initially', () => {
			expect(setup().shuffleState()).toBe(ShuffleState.OFF);
		});

		it('round-trips through the writer (enum value)', () => {
			const p = setup();
			p.shuffleState(ShuffleState.ON);
			expect(p.shuffleState()).toBe(ShuffleState.ON);
		});

		it('accepts a boolean shorthand', () => {
			const p = setup();
			p.shuffleState(true);
			expect(p.shuffleState()).toBe(ShuffleState.ON);
			p.shuffleState(false);
			expect(p.shuffleState()).toBe(ShuffleState.OFF);
		});
	});
});
