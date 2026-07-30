// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * A streamed track has no length at `loadedmetadata` — the element reports
 * Infinity/NaN until enough of the container has arrived. The player has to
 * pick the real length up afterwards, and has to understand the clock strings
 * consumer catalogues carry, or it sits on a zero duration for the whole track.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import nmplayer, { NMMusicPlayer } from '../index';

interface DurationEvent {
	duration: number;
}

function mount(id: string): void {
	const div = document.createElement('div');
	div.id = id;
	document.body.appendChild(div);
}

/** Drives the two backend handlers directly — no network, no decode. */
function handlers(player: NMMusicPlayer<any>, backendDuration: () => number) {
	const internals = player as unknown as {
		_makeTimeupdateHandler: (instance: unknown) => () => void;
		_makeLoadedMetadataHandler: (instance: unknown) => () => void;
	};
	const instance = {
		currentTime: () => 1,
		duration: backendDuration,
	};

	return {
		timeupdate: internals._makeTimeupdateHandler.call(player, instance),
		loadedmetadata: internals._makeLoadedMetadataHandler.call(player, instance),
	};
}

describe('duration resolution', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
		NMMusicPlayer._resetRegistry();
	});

	it('picks the length up once the stream finally reports one', () => {
		mount('duration-late');
		const player = nmplayer('duration-late');

		let backend = Number.POSITIVE_INFINITY;
		const { timeupdate, loadedmetadata } = handlers(player, () => backend);

		const emitted: number[] = [];
		player.on('duration', (data: DurationEvent) => emitted.push(data.duration));

		loadedmetadata();
		expect(emitted).toHaveLength(0);

		timeupdate();
		expect(emitted).toHaveLength(0);

		backend = 524;
		timeupdate();
		expect(emitted).toEqual([524]);

		// Latched — a steady stream must not re-announce the same length.
		timeupdate();
		expect(emitted).toEqual([524]);
	});

	it('never publishes the Infinity a live stream reports as its length', () => {
		mount('duration-infinite');
		const player = nmplayer('duration-infinite');

		const { loadedmetadata, timeupdate } = handlers(player, () => Number.POSITIVE_INFINITY);

		const emitted: number[] = [];
		player.on('duration', (data: DurationEvent) => emitted.push(data.duration));

		loadedmetadata();
		timeupdate();

		expect(emitted).toEqual([]);
	});
});
