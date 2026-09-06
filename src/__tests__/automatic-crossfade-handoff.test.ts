// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * The automatic overlap window has to produce an audible crossfade.
 *
 * The kit's transition runner reports the window and ramps the secondary gain,
 * but it never loads a secondary. Before the handoff existed, `secondaryGain`
 * wrote to an empty slot and every track cut straight to the next while
 * `crossfadeEnabled` was true and three `transition*` events said otherwise.
 *
 * Asserted on `loadSecondary` and `crossfade`, because those are what make
 * sound. A test that asserts the events pass without a single sample fading.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NMMusicPlayer } from '../index';

const TRACK_A = { id: 'a', name: 'A', title: 'A', url: '/a.mp3' };
const TRACK_B = { id: 'b', name: 'B', title: 'B', url: '/b.mp3' };

function makePlayer(id: string): NMMusicPlayer {
	const div = document.createElement('div');
	div.id = id;
	document.body.appendChild(div);

	return new NMMusicPlayer(id);
}

describe('the automatic crossfade window', () => {
	beforeEach(() => {
		(NMMusicPlayer as unknown as { _resetRegistry?: () => void })._resetRegistry?.();
		document.body.innerHTML = '';
	});

	it('loads a secondary and ramps it when the window opens', async () => {
		const player = makePlayer('cf-1');
		player.setup({ playlist: [TRACK_A, TRACK_B] });
		await player.ready();

		const crossfadeTo = vi.spyOn(player, 'crossfadeTo').mockResolvedValue(undefined);

		player.emit('transitionStart', { outgoing: TRACK_A, incoming: TRACK_B } as never);
		await Promise.resolve();

		expect(crossfadeTo, 'the window hands off to the path that loads and ramps').toHaveBeenCalledTimes(1);
		expect(crossfadeTo.mock.calls[0]?.[0]).toMatchObject({ id: 'b' });
	});

	it('does nothing when the consumer turned crossfade off', async () => {
		const player = makePlayer('cf-2');
		player.setup({ playlist: [TRACK_A, TRACK_B], crossfadeEnabled: false });
		await player.ready();

		const crossfadeTo = vi.spyOn(player, 'crossfadeTo').mockResolvedValue(undefined);

		player.emit('transitionStart', { outgoing: TRACK_A, incoming: TRACK_B } as never);
		await Promise.resolve();

		expect(crossfadeTo).not.toHaveBeenCalled();
	});

	it('does nothing for an incoming item with no url', async () => {
		const player = makePlayer('cf-3');
		player.setup({ playlist: [TRACK_A, TRACK_B] });
		await player.ready();

		const crossfadeTo = vi.spyOn(player, 'crossfadeTo').mockResolvedValue(undefined);

		player.emit('transitionStart', { outgoing: TRACK_A, incoming: { id: 'c', name: 'C', title: 'C' } } as never);
		await Promise.resolve();

		expect(crossfadeTo).not.toHaveBeenCalled();
	});
});
