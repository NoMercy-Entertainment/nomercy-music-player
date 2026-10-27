// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * The outgoing track may reach its natural end while the crossfade still runs
 * (a slow or throttled fade outlasts the remaining audio). Its `ended` belongs
 * to a track the crossfade already replaced: passed on, auto-advance skipped
 * one more song right after the new one faded in.
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

describe('the outgoing track ending during a crossfade', () => {
	beforeEach(() => {
		(NMMusicPlayer as unknown as { _resetRegistry?: () => void })._resetRegistry?.();
		document.body.innerHTML = '';
	});

	it('does not end the player, so nothing advances past the incoming track', async () => {
		const player = makePlayer('cf-ended-1');
		player.setup({ playlist: [TRACK_A, TRACK_B] });
		await player.ready();

		const backend = player.backend() as unknown as {
			supportsCrossfade: () => boolean;
			loadSecondary: (url: string) => Promise<void>;
			primeSecondary: () => Promise<void>;
			crossfade: (ms: number) => Promise<void>;
			emit: (event: string, payload: unknown) => void;
		};
		let finishFade!: () => void;
		vi.spyOn(backend, 'supportsCrossfade').mockReturnValue(true);
		vi.spyOn(backend, 'loadSecondary').mockResolvedValue(undefined);
		vi.spyOn(backend, 'primeSecondary').mockResolvedValue(undefined);
		vi.spyOn(backend, 'crossfade').mockImplementation(() => new Promise<void>((resolve) => {
			finishFade = resolve;
		}));

		const ended = vi.fn();
		player.on('ended', ended);

		const fade = player.crossfadeTo(TRACK_B as never);
		await vi.waitFor(() => expect(finishFade).toBeTypeOf('function'));

		backend.emit('ended', new Event('ended'));
		finishFade();
		await fade;

		expect(ended, 'the replaced track ending is not the player ending').not.toHaveBeenCalled();
	});

	it('moves the cursor to the incoming track without loading it again', async () => {
		const player = makePlayer('cf-ended-2');
		player.setup({ playlist: [TRACK_A, TRACK_B] });
		await player.ready();

		const backend = player.backend() as unknown as {
			supportsCrossfade: () => boolean;
			loadSecondary: (url: string) => Promise<void>;
			primeSecondary: () => Promise<void>;
			crossfade: (ms: number) => Promise<void>;
		};
		vi.spyOn(backend, 'supportsCrossfade').mockReturnValue(true);
		vi.spyOn(backend, 'loadSecondary').mockResolvedValue(undefined);
		vi.spyOn(backend, 'primeSecondary').mockResolvedValue(undefined);
		vi.spyOn(backend, 'crossfade').mockResolvedValue(undefined);
		const load = vi.spyOn(player, 'load');
		const items: string[] = [];
		player.on('item', data => items.push(String(data.item?.id)));

		await player.crossfadeTo(TRACK_B as never);
		await new Promise(resolve => setTimeout(resolve, 0));

		expect(load, 'the swapped element already plays the incoming track').not.toHaveBeenCalled();
		expect(player.item()?.id).toBe('b');
		expect(items).toEqual(['b']);
	});

	it('keeps publishing time after the swap, so the position reaches its listeners', async () => {
		const player = makePlayer('cf-ended-3');
		player.setup({ playlist: [TRACK_A, TRACK_B] });
		await player.ready();
		// Track A mounted, as a finished load() leaves it.
		(player as unknown as { _mountedItemId?: string })._mountedItemId = 'a';

		const backend = player.backend() as unknown as {
			supportsCrossfade: () => boolean;
			loadSecondary: (url: string) => Promise<void>;
			primeSecondary: () => Promise<void>;
			crossfade: (ms: number) => Promise<void>;
			emit: (event: string, payload: unknown) => void;
		};
		vi.spyOn(backend, 'supportsCrossfade').mockReturnValue(true);
		vi.spyOn(backend, 'loadSecondary').mockResolvedValue(undefined);
		vi.spyOn(backend, 'primeSecondary').mockResolvedValue(undefined);
		vi.spyOn(backend, 'crossfade').mockResolvedValue(undefined);

		await player.crossfadeTo(TRACK_B as never);
		const time = vi.fn();
		player.on('time', time);
		backend.emit('timeupdate', new Event('timeupdate'));

		expect(time, 'the incoming track is the mounted one now').toHaveBeenCalled();
	});
});
