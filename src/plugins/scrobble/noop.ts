// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { BasePlaylistItem } from '@nomercy-entertainment/nomercy-player-core';

import type { IScrobbler, ScrobbleContext } from './IScrobbler';

/**
 * No-op scrobbler. Ships as the default so `ScrobblePlugin` works out of the
 * box without any listening-history service configured. All calls resolve
 * immediately without side effects.
 *
 * Replace with a real implementation to track plays on Last.fm, ListenBrainz,
 * the NoMercy server activity endpoint, or any other service.
 */
export class NoopScrobbler<T extends BasePlaylistItem = BasePlaylistItem>
implements IScrobbler<T> {
	readonly id = 'noop';

	scrobble(_item: T, _context: ScrobbleContext): Promise<void> {
		return Promise.resolve();
	}

	nowPlaying(_item: T): Promise<void> {
		return Promise.resolve();
	}
}
