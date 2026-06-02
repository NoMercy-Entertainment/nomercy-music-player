import type { MediaSessionMetadata } from '@nomercy-entertainment/nomercy-player-core/plugins/media-session';
import type { NMMusicPlayer } from '../../index';
import type { MusicPlaylistItem } from '../../types';
import { MediaSessionPlugin as BaseMediaSession } from '@nomercy-entertainment/nomercy-player-core/plugins/media-session';

/**
 * Music-specific MediaSession integration. Reads canonical `MusicPlaylistItem`
 * fields — `name`, `artist`, `album`, `cover` — and synthesizes the
 * OS-level MediaMetadata.
 *
 * Only canonical text fields are resolved here. Artwork URL resolution goes
 * through the kit's auth-aware `urlResolver` pipeline in the base class.
 * Consumers that need URL rewriting use `setup({ baseUrl })` or
 * `setup({ urlResolver: ... })`.
 *
 * Consumers that need to derive `artist`/`album` from linked-entity arrays
 * should subclass and override `getMetadata()`.
 */
export class MediaSessionPlugin<T extends MusicPlaylistItem = MusicPlaylistItem> extends BaseMediaSession<NMMusicPlayer<T>, T> {
	static override readonly id: string = 'media-session';

	protected override getMetadata(item: T): MediaSessionMetadata {
		const title = item.name ?? '';
		const artist = item.artist ?? '';
		const album = item.album ?? '';
		return { title, artist, album };
	}
}

export const mediaSessionPlugin = MediaSessionPlugin;
