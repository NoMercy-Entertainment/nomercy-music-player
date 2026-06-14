// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { MusicPlaylistItem } from '../../types';

import type { ILyricSource } from './ILyricSource';

/**
 * LRC sidecar file source. Resolves lyrics by reading the track's
 * `lyricsUrl` field — the URL of a `.lrc` file stored alongside the
 * audio in the library.
 *
 * When `lyricsUrl` is absent the source returns `undefined` and the
 * `LyricsPlugin` skips the fetch silently.
 *
 * The actual HTTP fetch is performed by the `LyricsPlugin` via
 * `this.fetch()` so auth tokens, retry policy, and scope are all applied
 * transparently.
 */
export class LrcFileSource implements ILyricSource<MusicPlaylistItem> {
	readonly id = 'lrc-file';

	resolve(item: MusicPlaylistItem): string | undefined {
		return item.lyricsUrl;
	}
}
