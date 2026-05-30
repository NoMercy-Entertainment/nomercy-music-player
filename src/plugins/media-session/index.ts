import type { MediaSessionMetadata } from '@nomercy-entertainment/nomercy-player-core/plugins/media-session';
import type { NMMusicPlayer } from '../../index';
import type { MusicPlaylistItem } from '../../types';
import { MediaSessionPlugin as BaseMediaSession } from '@nomercy-entertainment/nomercy-player-core/plugins/media-session';
import { resolveNameList } from '../../utils/resolve-name-list';

/** Options for {@link MediaSessionPlugin}. */
export interface MediaSessionOptions {
	/** Base URL prepended to `item.cover` when constructing artwork `src`. */
	artworkBaseUrl?: string;
}

/**
 * Music-specific MediaSession integration. Reads canonical `MusicPlaylistItem`
 * fields — `name`, `artist_track[]`, `album_track[]`, `cover` — and synthesizes
 * the OS-level MediaMetadata.
 *
 * Only canonical fields are accessed. Consumers that carry server-specific flat
 * strings (`artist`, `album`) should subclass and override `getMetadata()`.
 */
export class MediaSessionPlugin<T extends MusicPlaylistItem = MusicPlaylistItem> extends BaseMediaSession<NMMusicPlayer<T>, T> {
	static override readonly id: string = 'media-session';

	/** Narrows the inherited `opts` to the music-specific options shape. */
	declare opts: MediaSessionOptions;

	protected override getMetadata(item: T): MediaSessionMetadata {
		const title = item.name ?? '';
		const artist = resolveNameList(item.artist_track);
		const album = resolveNameList(item.album_track);
		const base = this.opts?.artworkBaseUrl ?? '';
		const coverSrc = item.cover
			? (base ? `${base}${item.cover}` : item.cover)
			: undefined;
		return {
			title,
			artist,
			album,
			artwork: coverSrc
				? [{
						src: coverSrc,
						sizes: '512x512',
					}]
				: undefined,
		};
	}
}

export const mediaSessionPlugin = MediaSessionPlugin;
