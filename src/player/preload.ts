// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { BasePlaylistItem, PreloadAsset } from '@nomercy-entertainment/nomercy-player-core';
import type { MusicPlaylistItem } from '../types';
import { DefaultPreloadStrategy } from '@nomercy-entertainment/nomercy-player-core';

/**
 * Music-domain preload strategy. Extends the kit's `DefaultPreloadStrategy`
 * to include music-specific assets: the audio manifest/segment, album cover art,
 * and the lyrics sidecar when present.
 *
 * Per-item asset list is constructed from the item's typed fields — consumers
 * that extend `MusicPlaylistItem` with additional URL fields can subclass this
 * and override `assetsToPreload`.
 */
export class MusicPreloadStrategy extends DefaultPreloadStrategy {
	override assetsToPreload(item: BasePlaylistItem): PreloadAsset[] {
		const musicItem = item as MusicPlaylistItem;
		const assets: PreloadAsset[] = [];

		if (musicItem.url) {
			assets.push({
				url: musicItem.url,
				category: 'media',
				mode: 'metadata',
			});
		}

		if (musicItem.cover) {
			assets.push({
				url: musicItem.cover,
				category: 'poster',
				mode: 'auto',
			});
		}

		if (musicItem.lyricsUrl) {
			assets.push({
				url: musicItem.lyricsUrl,
				category: 'lyrics',
				mode: 'auto',
			});
		}

		return assets;
	}
}
