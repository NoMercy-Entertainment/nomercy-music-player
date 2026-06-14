// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { BasePlaylistItem } from '@nomercy-entertainment/nomercy-player-core';
import type { INowPlayingArt } from './INowPlayingArt';

/** Loose shape covering music item fields used for Media Session metadata. */
interface MusicMetadataSource extends BasePlaylistItem {
	name?: string;
	title?: string;
	artist?: string;
	album?: string;
}

/**
 * Media Session API now-playing art provider.
 *
 * Sets `navigator.mediaSession.metadata` with the track title, artist,
 * album, and artwork URL on every track change. When Media Session is
 * unavailable (server-side rendering, some embedded environments) all
 * calls are no-ops.
 *
 * Artwork is passed in as a resolved URL — the caller (MediaSessionPlugin)
 * is responsible for URL resolution via `this.resolveUrl()`.
 */
export class MediaSessionArtProvider<T extends BasePlaylistItem = BasePlaylistItem>
implements INowPlayingArt<T> {
	readonly id = 'media-session';

	async publish(item: T, artwork: string | undefined): Promise<void> {
		if (typeof navigator === 'undefined' || !navigator.mediaSession)
			return;

		const source = item as MusicMetadataSource;
		const title = source.name ?? source.title ?? '';
		const artist = source.artist ?? '';
		const album = source.album ?? '';

		navigator.mediaSession.metadata = new MediaMetadata({
			title,
			artist,
			album,
			artwork: artwork
				? [{
						src: artwork,
						sizes: '512x512',
					}]
				: [],
		});
	}

	clear(): void {
		if (typeof navigator === 'undefined' || !navigator.mediaSession)
			return;
		navigator.mediaSession.metadata = null;
	}
}
