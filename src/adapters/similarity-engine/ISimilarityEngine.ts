// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { BasePlaylistItem } from '@nomercy-entertainment/nomercy-player-core';

/**
 * Port for "find similar items given a seed item."
 *
 * Reserved for a future radio-mode / "more like this" feature and the
 * `SmartShuffleGenerator` when tag-based similarity is insufficient — not
 * yet wired to any plugin. No scoped consumer exists today; keep the
 * contract defined so a future feature doesn't have to redesign it.
 *
 * No default adapter is shipped — consumers wire their own implementation:
 *   - Server-driven (NoMercy media server recommendation endpoint)
 *   - Audio-feature-based (BPM / key / energy similarity)
 *   - Tag-based (genre / decade / mood)
 *   - ML embedding (vector proximity)
 *   - External service (Last.fm similar tracks, Spotify recommendations)
 */
export interface ISimilarityEngine<T extends BasePlaylistItem = BasePlaylistItem> {
	/** Human-readable identifier. Used in logging and debug tooling. */
	readonly id: string;

	/**
	 * Resolve a list of items similar to `seed`, ordered by descending
	 * similarity score (most similar first).
	 *
	 * @param seed - The reference item to find similar items for.
	 * @param opts - Optional tuning knobs for the query.
	 * @returns Array of similar items. Empty array when no results are available.
	 */
	findSimilar(
		seed: T,
		opts?: SimilarityQueryOptions,
	): Promise<T[]>;
}

/** Tuning options passed to {@link ISimilarityEngine.findSimilar}. */
export interface SimilarityQueryOptions {
	/** Maximum number of results to return. Default is implementation-defined. */
	limit?: number;
	/** Exclude item IDs already present in the current queue. */
	excludeIds?: ReadonlyArray<string | number>;
	/** Minimum similarity score in the range [0, 1]. Implementation-defined scale. */
	minScore?: number;
}
