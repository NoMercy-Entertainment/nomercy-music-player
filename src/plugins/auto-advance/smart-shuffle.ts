// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { BasePlaylistItem } from '@nomercy-entertainment/nomercy-player-core';

import type { IPlaylistGenerator } from './IPlaylistGenerator';

/** Minimal shape for items that carry genre / decade tags. */
interface TaggedItem extends BasePlaylistItem {
	genre?: string | string[];
	decade?: number | string;
}

/**
 * Smart shuffle generator. Tag-aware shuffle that avoids playing the same
 * genre or decade back-to-back when enough variety exists in the queue.
 *
 * Algorithm:
 *   1. Collect all indices except `currentIndex`.
 *   2. Score each candidate — penalize items sharing the same genre/decade
 *      as the current item.
 *   3. Pick randomly from the top-scored pool.
 *
 * Falls back to uniform random when no tag fields are present on the items.
 *
 * `previous()` returns a random item from the backlog of already-played
 * items when available, or a random queue item otherwise.
 */
export class SmartShuffleGenerator<T extends BasePlaylistItem = BasePlaylistItem>
implements IPlaylistGenerator<T> {
	readonly id = 'smart-shuffle';

	private readonly played: number[] = [];

	next(items: ReadonlyArray<T>, currentIndex: number): number | undefined {
		if (items.length === 0)
			return undefined;
		if (items.length === 1)
			return 0;

		const candidates = items
			.map((_item, idx) => idx)
			.filter(idx => idx !== currentIndex);

		if (candidates.length === 0)
			return undefined;

		const current = currentIndex >= 0 ? (items[currentIndex] as TaggedItem | undefined) : undefined;
		const currentGenres = this.toSet(current?.genre);
		const currentDecade = current?.decade;

		const scored = candidates.map((idx) => {
			const item = items[idx] as TaggedItem;
			const genres = this.toSet(item.genre);
			const genreOverlap = [...genres].some(genre => currentGenres.has(genre));
			const sameDecade = item.decade !== undefined && item.decade === currentDecade;
			const penalty = (genreOverlap ? 1 : 0) + (sameDecade ? 1 : 0);
			return {
				idx,
				score: -penalty + Math.random() * 0.5,
			};
		});

		scored.sort((itemA, itemB) => itemB.score - itemA.score);

		const topScore = scored[0]!.score;
		const top = scored.filter(item => item.score >= topScore - 0.1);
		const chosen = top[Math.floor(Math.random() * top.length)]!.idx;

		if (currentIndex >= 0)
			this.played.push(currentIndex);

		return chosen;
	}

	previous(items: ReadonlyArray<T>, _currentIndex: number): number | undefined {
		if (items.length === 0)
			return undefined;

		if (this.played.length > 0) {
			return this.played.pop();
		}

		const randomIdx = Math.floor(Math.random() * items.length);
		return randomIdx;
	}

	private toSet(field: string | string[] | undefined): Set<string> {
		if (!field)
			return new Set();
		if (typeof field === 'string')
			return new Set([field]);
		return new Set(field);
	}
}
