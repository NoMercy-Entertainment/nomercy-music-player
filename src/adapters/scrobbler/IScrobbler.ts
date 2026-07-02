// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { BasePlaylistItem } from '@nomercy-entertainment/nomercy-player-core';

/**
 * Port for recording that a track was listened to (Last.fm-style scrobbling).
 *
 * This port is defined but not yet wired by the player: nothing in the player
 * calls `scrobble()` or `nowPlaying()`. A consumer that wants scrobbling must
 * invoke these methods itself (for example from its own `time` / `ended`
 * handlers).
 *
 * Built-in adapter:
 *   - `NoopScrobbler` — no-op implementation (default, ships so the player
 *     works without any scrobbling configured)
 *
 * Consumers wire their own implementation for Last.fm, ListenBrainz,
 * the NoMercy server activity tracker, or any other listening history service.
 */
export interface IScrobbler<T extends BasePlaylistItem = BasePlaylistItem> {
	/** Human-readable identifier. Used in logging and debug tooling. */
	readonly id: string;

	/**
	 * Record that `item` was listened to.
	 *
	 * @param item - The track that was scrobbled.
	 * @param context - Contextual metadata for the scrobble event.
	 */
	scrobble(item: T, context: ScrobbleContext): Promise<void>;

	/**
	 * Signal that a track has started playing. Used by services that want to
	 * display "now playing" information (distinct from the completed scrobble).
	 * Optional — implementations that don't support now-playing can no-op.
	 *
	 * @param item - The track that started playing.
	 */
	nowPlaying?(item: T): Promise<void>;
}

/** Context passed alongside a scrobble event. */
export interface ScrobbleContext {
	/** Playback start time as a Unix timestamp (seconds). */
	startedAt: number;
	/** Total seconds the user actually listened (after subtracting seeks / gaps). */
	listenedSeconds: number;
	/** Total track duration in seconds. */
	durationSeconds: number;
	/** Whether the track was chosen by the user or auto-advanced. */
	source: 'user' | 'auto' | 'radio';
}
