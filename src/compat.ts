/**
 * @module @nomercy-entertainment/nomercy-music-player/compat
 *
 * v1 compatibility shim for the music player. All deprecated names / fields
 * live here. v1 consumers import from `./compat` and use the re-exported
 * aliases or run config through `applyMusicV1Compat` once before `setup()`.
 *
 * ```ts
 * import nmMPlayer, { applyMusicV1Compat } from '@nomercy-entertainment/nomercy-music-player/compat';
 * const player = nmMPlayer('my-div');
 * player.setup(applyMusicV1Compat({ accessToken: () => store.token, ... }));
 * ```
 */

import type { BasePlaylistItem } from '@nomercy-entertainment/nomercy-player-core';
import type {
	AlbumRef,
	ArtistRef,
	MusicPlayerConfig,
	MusicPlaylistItem,
} from './types';
import { applyKitV1Compat } from '@nomercy-entertainment/nomercy-player-core/compat';

import { nmMusicPlayer } from './index';

export { default, nmMusicPlayer } from './index';
export type { NMMusicPlayer } from './index';

// ── Factory alias ─────────────────────────────────────────────────────────────

/**
 * @deprecated Use `nmMusicPlayer` (named) or the default export instead.
 * This alias exists for v1 consumers using `nmMPlayer`.
 */
export const nmMPlayer = nmMusicPlayer;

// ── Deprecated item field shapes ──────────────────────────────────────────────

/**
 * v1 `MusicPlaylistItem` shape with deprecated `artist_track` / `album_track`
 * field names. Pass items through `normalizeMusicItem` before handing to the
 * v2 player.
 */
export interface MusicPlaylistItemV1Compat extends BasePlaylistItem {
	name: string;
	cover?: string;
	/**
	 * @deprecated Use `artistTracks` instead.
	 */
	artist_track?: ArtistRef[];
	/**
	 * @deprecated Use `albumTracks` instead.
	 */
	album_track?: AlbumRef[];
	url?: string;
	lyricsUrl?: string;
	duration?: number;
}

/**
 * Normalise a v1 `MusicPlaylistItem` (with `artist_track` / `album_track`)
 * to the v2 canonical shape (`artistTracks` / `albumTracks`). Safe on
 * already-normalised items — existing v2 fields win.
 */
export function normalizeMusicItem<T extends MusicPlaylistItemV1Compat>(item: T): Omit<T, 'artist_track' | 'album_track'> & MusicPlaylistItem {
	const result = { ...item } as Record<string, unknown>;

	if (result['artist_track'] !== undefined && result['artistTracks'] === undefined) {
		result['artistTracks'] = result['artist_track'];
	}

	if (result['album_track'] !== undefined && result['albumTracks'] === undefined) {
		result['albumTracks'] = result['album_track'];
	}

	delete result['artist_track'];
	delete result['album_track'];

	return result as Omit<T, 'artist_track' | 'album_track'> & MusicPlaylistItem;
}

// ── Config normalizer ─────────────────────────────────────────────────────────

/**
 * Normalise a v1 music player config to the v2 `MusicPlayerConfig` shape.
 * Applies the kit-level normalizer (accessToken, debug) on top.
 */
export function applyMusicV1Compat<T extends BasePlaylistItem = MusicPlaylistItem>(
	config: MusicPlayerConfig<T> & { accessToken?: string | (() => string); debug?: boolean },
): MusicPlayerConfig<T> {
	return applyKitV1Compat(config) as MusicPlayerConfig<T>;
}
