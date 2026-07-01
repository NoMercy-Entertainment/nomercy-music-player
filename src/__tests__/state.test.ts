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
			const musicPlayer = setup();
			await musicPlayer.play();
			expect(musicPlayer.playState()).toBe(PlayState.PLAYING);
		});

		it('transitions to PAUSED after pause()', async () => {
			const musicPlayer = setup();
			await musicPlayer.play();
			await musicPlayer.pause();
			expect(musicPlayer.playState()).toBe(PlayState.PAUSED);
		});

		it('transitions to STOPPED after stop()', async () => {
			const musicPlayer = setup();
			await musicPlayer.play();
			await musicPlayer.stop();
			expect(musicPlayer.playState()).toBe(PlayState.STOPPED);
		});
	});

	describe('volumeState()', () => {
		it('returns UNMUTED initially', () => {
			expect(setup().volumeState()).toBe(VolumeState.UNMUTED);
		});

		it('transitions to MUTED after mute()', () => {
			const musicPlayer = setup();
			musicPlayer.mute();
			expect(musicPlayer.volumeState()).toBe(VolumeState.MUTED);
		});

		it('transitions back to UNMUTED after unmute()', () => {
			const musicPlayer = setup();
			musicPlayer.mute();
			musicPlayer.unmute();
			expect(musicPlayer.volumeState()).toBe(VolumeState.UNMUTED);
		});

		it('toggleMute flips state', () => {
			const musicPlayer = setup();
			musicPlayer.toggleMute();
			expect(musicPlayer.volumeState()).toBe(VolumeState.MUTED);
			musicPlayer.toggleMute();
			expect(musicPlayer.volumeState()).toBe(VolumeState.UNMUTED);
		});
	});

	describe('repeatState() — overloaded read/write', () => {
		it('returns OFF initially', () => {
			expect(setup().repeatState()).toBe(RepeatState.OFF);
		});

		it('round-trips through the writer', () => {
			const musicPlayer = setup();
			musicPlayer.repeatState(RepeatState.ALL);
			expect(musicPlayer.repeatState()).toBe(RepeatState.ALL);
			musicPlayer.repeatState(RepeatState.ONE);
			expect(musicPlayer.repeatState()).toBe(RepeatState.ONE);
		});
	});

	describe('shuffleState() — overloaded read/write', () => {
		it('returns OFF initially', () => {
			expect(setup().shuffleState()).toBe(ShuffleState.OFF);
		});

		it('round-trips through the writer (enum value)', () => {
			const musicPlayer = setup();
			musicPlayer.shuffleState(ShuffleState.ON);
			expect(musicPlayer.shuffleState()).toBe(ShuffleState.ON);
		});

		it('accepts a boolean shorthand', () => {
			const musicPlayer = setup();
			musicPlayer.shuffleState(true);
			expect(musicPlayer.shuffleState()).toBe(ShuffleState.ON);
			musicPlayer.shuffleState(false);
			expect(musicPlayer.shuffleState()).toBe(ShuffleState.OFF);
		});
	});
});
