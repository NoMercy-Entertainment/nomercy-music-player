// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { ChromeCastMediaCtors, Translations } from '@nomercy-entertainment/nomercy-player-core';
import type { NMMusicPlayer } from '../../index';
import type { MusicPlaylistItem } from '../../types';
import { CastSenderPlugin as BaseCastSenderPlugin, translationsFromGlob } from '@nomercy-entertainment/nomercy-player-core';

export type { CastSenderEvents, CastSenderOptions } from '@nomercy-entertainment/nomercy-player-core';

/**
 * Music Cast sender — thin override of the kit's shared `CastSenderPlugin`.
 * Specializes only the bits that differ between music and video:
 *   - `'audio/mpeg'` default content type
 *   - `MusicTrackMediaMetadata` builder reading `name` / `artist` /
 *     `album` / `cover` from the music item shape.
 *
 * Translations are auto-discovered from the `./i18n/*.ts` folder. Each file
 * default-exports its language bundle. Each plugin in the chain (kit base,
 * this subclass) ships ONLY its own keys — the kit's plugin registration
 * walks the prototype chain so both bundles end up in the table.
 *
 * Everything else — SDK probe, session lifecycle, RemotePlayer event
 * mirroring, forward* helpers, resume-on-disconnect — lives in the kit.
 */
export class CastSenderPlugin<T extends MusicPlaylistItem = MusicPlaylistItem> extends BaseCastSenderPlugin<NMMusicPlayer<T>, T> {
	static override readonly id: string = 'cast-sender';
	static override readonly description: string = 'Chromecast sender — full media bridge for music';
	static override readonly translations: Translations = translationsFromGlob('./i18n/*.ts');

	/** Returns `'audio/mpeg'` as the default content type for music items. */
	protected override defaultContentType(): string {
		return 'audio/mpeg';
	}

	/** Builds a `MusicTrackMediaMetadata` (or `GenericMediaMetadata` fallback) from the music item. */
	protected override async buildMetadata(
		item: T,
		ctors: ChromeCastMediaCtors & { MusicTrackMediaMetadata?: new () => Record<string, unknown> },
	): Promise<unknown> {
		const Music = ctors.MusicTrackMediaMetadata ?? ctors.GenericMediaMetadata;
		const meta = new Music();
		meta['title'] = item.name ?? '';
		if (item.artist)
			meta['artist'] = item.artist;
		if (item.album)
			meta['albumName'] = item.album;
		if (item.cover) {
			const cover = (await this.resolveUrl(item.cover, 'poster')).href;
			meta['images'] = [{ url: cover }];
		}
		return meta;
	}
}

/** Plugin alias for the music {@link CastSenderPlugin}. Pass to `addPlugin(castSenderPlugin)`. */
export const castSenderPlugin = CastSenderPlugin;
