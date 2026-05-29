import type { BasePlaylistItem } from '@nomercy-entertainment/nomercy-player-core';

import type { INowPlayingArt } from './INowPlayingArt';

/** Loose shape covering music item fields used for Media Session metadata. */
interface MusicMetadataSource extends BasePlaylistItem {
	name?: string;
	title?: string;
	artist_track?: Array<{ name: string }> | string;
	artist?: string;
	album_track?: Array<{ name: string }> | string;
	album?: string;
}

function resolveDisplayName(field: Array<{ name: string }> | string | undefined): string {
	if (!field)
		return '';
	if (typeof field === 'string')
		return field;
	return field.map(entry => entry?.name).filter(Boolean)
		.join(', ');
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
		const artist = resolveDisplayName(source.artist_track) || (source.artist ?? '');
		const album = resolveDisplayName(source.album_track) || (source.album ?? '');

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
