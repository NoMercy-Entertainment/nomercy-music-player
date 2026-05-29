import type { BasePlaylistItem } from '@nomercy-entertainment/nomercy-player-core';

/**
 * Port for getting synced or plain lyrics for a track.
 *
 * The `LyricsPlugin` calls `resolve()` on every track change and
 * passes the result to the kit's cue parser registry for parsing.
 *
 * Built-in adapter:
 *   - `LrcFileSource` — reads `.lrc` sidecar files from the library
 *     where present, via the kit's `IFetch` adapter.
 *
 * Consumers wire their own implementation to pull lyrics from:
 *   - Embedded ID3 tags (SYLT / USLT)
 *   - A lyrics API (Genius, Musixmatch, the NoMercy server endpoint)
 *   - A custom CDN path convention
 */
export interface ILyricSource<T extends BasePlaylistItem = BasePlaylistItem> {
	/** Human-readable identifier. Used in logging and debug tooling. */
	readonly id: string;

	/**
	 * Resolve the lyrics URL or content for `item`.
	 *
	 * Returning a string URL tells the `LyricsPlugin` to fetch the content
	 * via `this.fetch()` (auth-aware, retried). Returning `undefined` signals
	 * that no lyrics are available for this item.
	 *
	 * @param item - The track to resolve lyrics for.
	 * @returns A URL string, or `undefined` when no lyrics are available.
	 */
	resolve(item: T): string | undefined;
}
