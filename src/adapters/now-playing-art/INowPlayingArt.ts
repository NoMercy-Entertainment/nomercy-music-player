// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { BasePlaylistItem } from '@nomercy-entertainment/nomercy-player-core';

/**
 * Port for publishing now-playing artwork to OS-native UI surfaces.
 *
 * Implementations push album art and track metadata to platform surfaces
 * such as the browser Media Session API, AirPlay metadata, lock screen
 * displays, or OS-level notification panels.
 *
 * Built-in adapter:
 *   - `MediaSessionArtProvider` — uses the browser Media Session API
 *     (`navigator.mediaSession.metadata`) to push artwork and metadata
 *     to lock screens, notification panels, and browser media controls.
 *
 * Consumers wire their own implementation for native-shell scenarios
 * (Capacitor, Electron) or custom cast receiver artwork feeds.
 */
export interface INowPlayingArt<T extends BasePlaylistItem = BasePlaylistItem> {
	/** Human-readable identifier. Used in logging and debug tooling. */
	readonly id: string;

	/**
	 * Publish now-playing metadata and artwork for `item`.
	 *
	 * Called by the player when the current track changes. Implementations
	 * may do nothing when the platform surface is unavailable.
	 *
	 * @param item - The track now playing.
	 * @param artwork - Resolved artwork URL, or `undefined` when no art is available.
	 */
	publish(item: T, artwork: string | undefined): Promise<void>;

	/**
	 * Clear the now-playing metadata — called when the player stops or is
	 * disposed. Implementations that do not support clearing may no-op.
	 */
	clear(): void;
}
