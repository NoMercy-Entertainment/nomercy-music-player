// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { BasePlaylistItem } from '@nomercy-entertainment/nomercy-player-core';

import type { IPlaylistGenerator } from './IPlaylistGenerator';

/**
 * Linear playlist generator. Plays items in sequential order.
 *
 * `next()` returns `currentIndex + 1`, or `undefined` at the end.
 * `previous()` returns `currentIndex - 1`, or `undefined` at the start.
 *
 * This is the implicit default — `AutoAdvancePlugin` without `opts.generator`
 * behaves identically to this generator via the player's own `next()`.
 */
export class LinearPlaylistGenerator<T extends BasePlaylistItem = BasePlaylistItem>
implements IPlaylistGenerator<T> {
	readonly id = 'linear';

	next(items: ReadonlyArray<T>, currentIndex: number): number | undefined {
		const nextIndex = currentIndex + 1;
		return nextIndex < items.length ? nextIndex : undefined;
	}

	previous(items: ReadonlyArray<T>, currentIndex: number): number | undefined {
		const prevIndex = currentIndex - 1;
		return prevIndex >= 0 ? prevIndex : undefined;
	}
}
