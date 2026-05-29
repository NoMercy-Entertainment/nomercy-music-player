import type { MediaSessionMetadata } from '@nomercy-entertainment/nomercy-player-core/plugins/media-session';
import type { NMMusicPlayer } from '../../index';
import type { MusicPlaylistItem } from '../../types';
import { MediaSessionPlugin as BaseMediaSession } from '@nomercy-entertainment/nomercy-player-core/plugins/media-session';

/** Options for {@link MediaSessionPlugin}. */
export interface MediaSessionOptions {
	/** Base URL prepended to `item.cover` when constructing artwork `src`. */
	artworkBaseUrl?: string;
}

/** Loose shape covering both the canonical `MusicPlaylistItem` and ad-hoc items. */
interface MusicMetadataSource {
	name?: string;
	title?: string;
	cover?: string;
	artist_track?: Array<{ name: string }> | string;
	artist?: string;
	album_track?: Array<{ name: string }> | string;
	album?: string;
}

/** Reduce an artist/album list/string field down to a single display string. */
function resolveName(field: Array<{ name: string }> | string | undefined): string {
	if (!field)
		return '';
	if (typeof field === 'string')
		return field;
	return field.map(x => x?.name).filter(Boolean)
		.join(', ');
}

/**
 * Music-specific MediaSession integration. Reads music-shaped fields off the
 * playlist item — `name`, `artist_track[]`, `album_track[]`, `cover` — and
 * synthesizes the OS-level MediaMetadata.
 */
export class MediaSessionPlugin extends BaseMediaSession<NMMusicPlayer<any>, MusicPlaylistItem> {
	static override readonly id: string = 'media-session';

	/** Narrows the inherited `opts` to the music-specific options shape. */
	declare opts: MediaSessionOptions;

	protected override getMetadata(item: MusicPlaylistItem): MediaSessionMetadata {
		const x = item as MusicPlaylistItem & MusicMetadataSource;
		const title = x.name ?? x.title ?? '';
		const artist = resolveName(x.artist_track) || (x.artist ?? '');
		const album = resolveName(x.album_track) || (x.album ?? '');
		const base = this.opts?.artworkBaseUrl ?? '';
		const coverSrc = x.cover ? (base ? `${base}${x.cover}` : x.cover) : undefined;
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
