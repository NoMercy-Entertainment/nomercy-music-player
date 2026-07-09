// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * Music KeyHandlerPlugin binding behaviour. The plugin-extras suite pins that
 * the n/p/r/s combos EXIST; this suite pins what each one actually does when
 * a real keydown reaches the document scope:
 *
 *  - `n` → player.next()
 *  - `p` → player.previous()
 *  - `r` → cycles repeat off → all → one → off
 *  - `s` → toggles shuffle on ↔ off
 *
 * Plus the typing-target guard: keys originating from editable elements never
 * reach the bindings.
 */

import type { MusicPlaylistItem } from '../../types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NMMusicPlayer } from '../../index';
import { KeyHandlerPlugin } from '../../plugins/key-handler';
import { RepeatState, ShuffleState } from '../../types';

function track(id: string): MusicPlaylistItem {
	return {
		id,
		name: `track ${id}`,
	};
}

function tick(): Promise<void> {
	return new Promise<void>(resolve => setTimeout(resolve, 0));
}

function pressKey(key: string): void {
	document.dispatchEvent(new KeyboardEvent('keydown', { key }));
}

let idCounter = 0;
const activePlayers: NMMusicPlayer[] = [];

async function makePlayerWithKeys(): Promise<NMMusicPlayer> {
	idCounter += 1;
	const id = `key-bindings-${idCounter}`;
	const div = document.createElement('div');
	div.id = id;
	document.body.appendChild(div);

	const player = new NMMusicPlayer(id).setup({});
	player.addPlugin(KeyHandlerPlugin, { cooldownMs: 0 } as any);
	await player.ready();
	activePlayers.push(player);
	return player;
}

describe('music KeyHandlerPlugin bindings', () => {
	beforeEach(() => {
		(NMMusicPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
	});

	afterEach(() => {
		// Detach every player's document-scoped keydown listener — otherwise
		// later keypresses fan out to earlier tests' players. removePluginById
		// runs the plugin lifecycle teardown that releases the listener.
		for (const player of activePlayers.splice(0)) {
			player.removePluginById('key-handler');
		}
		(NMMusicPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		document.body.innerHTML = '';
		vi.restoreAllMocks();
	});

	it('"n" advances via player.next()', async () => {
		const player = await makePlayerWithKeys();
		const nextSpy = vi.spyOn(player, 'next').mockResolvedValue(undefined);

		pressKey('n');

		expect(nextSpy).toHaveBeenCalledTimes(1);
	});

	it('"p" goes back via player.previous()', async () => {
		const player = await makePlayerWithKeys();
		const previousSpy = vi.spyOn(player, 'previous').mockResolvedValue(undefined);

		pressKey('p');

		expect(previousSpy).toHaveBeenCalledTimes(1);
	});

	it('"r" cycles the repeat state off → all → one → off', async () => {
		const player = await makePlayerWithKeys();
		expect(player.repeatState()).toBe(RepeatState.OFF);

		pressKey('r');
		await tick();
		expect(player.repeatState()).toBe(RepeatState.ALL);

		pressKey('r');
		await tick();
		expect(player.repeatState()).toBe(RepeatState.ONE);

		pressKey('r');
		await tick();
		expect(player.repeatState()).toBe(RepeatState.OFF);
	});

	it('"s" toggles shuffle on and back off', async () => {
		const player = await makePlayerWithKeys();
		player.queue([track('a'), track('b'), track('c')]);
		expect(player.shuffleState()).toBe(ShuffleState.OFF);

		pressKey('s');
		await tick();
		expect(player.shuffleState()).toBe(ShuffleState.ON);

		pressKey('s');
		await tick();
		expect(player.shuffleState()).toBe(ShuffleState.OFF);
	});

	it('keys typed into an input element never reach the bindings', async () => {
		const player = await makePlayerWithKeys();
		const nextSpy = vi.spyOn(player, 'next').mockResolvedValue(undefined);

		const input = document.createElement('input');
		document.body.appendChild(input);
		input.dispatchEvent(new KeyboardEvent('keydown', {
			key: 'n',
			bubbles: true,
		}));

		expect(nextSpy).not.toHaveBeenCalled();
	});

	it('MediaTrackNext / MediaTrackPrevious hardware keys stay wired through the kit defaults', async () => {
		const player = await makePlayerWithKeys();
		const nextSpy = vi.spyOn(player, 'next').mockResolvedValue(undefined);
		const previousSpy = vi.spyOn(player, 'previous').mockResolvedValue(undefined);

		pressKey('MediaTrackNext');
		pressKey('MediaTrackPrevious');

		expect(nextSpy).toHaveBeenCalledTimes(1);
		expect(previousSpy).toHaveBeenCalledTimes(1);
	});
});
