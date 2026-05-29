import type { BasePlaylistItem } from '@nomercy-entertainment/nomercy-player-core';

/**
 * Port for "what comes next?" queue decision logic.
 *
 * Implementations receive the current queue snapshot and the index of the
 * currently-playing item, then return the index of the next item to play.
 * Returning `undefined` signals end-of-queue (no next track).
 *
 * Built-in adapters:
 *   - `LinearPlaylistGenerator` — play items in order (default)
 *   - `SmartShuffleGenerator` — tag-aware shuffle within the library
 *
 * Consumers can provide their own implementation to drive server-side
 * recommendations, radio mode, mood-based ordering, etc.
 */
export interface IPlaylistGenerator<T extends BasePlaylistItem = BasePlaylistItem> {
	/** Human-readable identifier. Used in logging and debug tooling. */
	readonly id: string;

	/**
	 * Resolve the next item index given the current queue state.
	 *
	 * @param items - The current ordered queue snapshot.
	 * @param currentIndex - Zero-based index of the item currently playing.
	 *   `-1` when no item is playing.
	 * @returns The zero-based index of the next item, or `undefined` when
	 *   there is no next item (end of queue / playlist finished).
	 */
	next(items: ReadonlyArray<T>, currentIndex: number): number | undefined;

	/**
	 * Resolve the previous item index given the current queue state.
	 *
	 * @param items - The current ordered queue snapshot.
	 * @param currentIndex - Zero-based index of the item currently playing.
	 * @returns The zero-based index of the previous item, or `undefined` when
	 *   there is no previous item.
	 */
	previous(items: ReadonlyArray<T>, currentIndex: number): number | undefined;
}
