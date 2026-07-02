// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { BasePlaylistItem } from '@nomercy-entertainment/nomercy-player-core';
import type { NMMusicPlayer } from '../../index';
import type { MusicPlaylistItem } from '../../types';
import type { IScrobbler } from './IScrobbler';
import { Plugin } from '@nomercy-entertainment/nomercy-player-core';
import { NoopScrobbler } from './noop';

export type { IScrobbler, ScrobbleContext } from './IScrobbler';
export { NoopScrobbler } from './noop';

/** Options for {@link ScrobblePlugin}. */
export interface ScrobbleOptions {
	/** Playback-reporting backend. Defaults to a no-op that never reports. */
	scrobbler?: IScrobbler<MusicPlaylistItem>;
	/** Fraction of an item's duration counted as "listened enough". Default `0.5` — Last.fm's 50% rule. */
	thresholdRatio?: number;
	/** Absolute listened-seconds ceiling; whichever of this or `thresholdRatio` is reached first wins. Default `240` — Last.fm's 4-minute rule. */
	thresholdSeconds?: number;
	/** Items shorter than this are never scrobbled. Default `30` — Last.fm's 30-second floor. */
	minDurationSeconds?: number;
}

/** Events emitted by {@link ScrobblePlugin}. */
export interface ScrobbleEvents {
	/** Fired once per item, right after the configured `IScrobbler.nowPlaying()` resolves. */
	nowPlaying: { item: MusicPlaylistItem };
	/** Fired once per item, right after the configured `IScrobbler.scrobble()` resolves. */
	scrobbled: { item: MusicPlaylistItem; listenedSeconds: number };
}

/**
 * Playback-reporting plugin. Tracks listened time against the player's
 * `time` / `item` / `ended` events and reports to the configured
 * {@link IScrobbler}:
 *
 *  - `nowPlaying(item)` fires once per item, immediately on cursor change.
 *  - `scrobble(item, context)` fires once per item, the first time
 *    accumulated listened time crosses `min(duration * thresholdRatio,
 *    thresholdSeconds)` — mirrors the real Last.fm 50%-or-4-minute rule.
 *    Items shorter than `minDurationSeconds` are never scrobbled.
 *
 * Ships with `NoopScrobbler` as the default `opts.scrobbler` so the plugin is
 * inert until a real backend (Last.fm, ListenBrainz, the NoMercy server
 * activity endpoint) is wired in.
 */
export class ScrobblePlugin extends Plugin<NMMusicPlayer, ScrobbleOptions, ScrobbleEvents> {
	static override readonly id: string = 'scrobble';
	static override readonly version: string = '2.0.0';
	static override readonly description: string = 'Reports now-playing + threshold-based scrobbles to an IScrobbler backend';

	private readonly defaultScrobbler = new NoopScrobbler<MusicPlaylistItem>();

	private currentItem?: MusicPlaylistItem;
	private listenedSeconds = 0;
	private lastTime = 0;
	private lastDuration = 0;
	private startedAt = 0;
	private hasScrobbled = false;

	override use(): void {
		this.on('item', (payload) => {
			this.resetTracking();

			const item = payload?.item;
			if (!item || !this.isMusicItem(item))
				return;

			this.currentItem = item;
			this.startedAt = Math.floor(this.player.now() / 1000);
			void this.reportNowPlaying(item);
		});

		this.on('time', (payload) => {
			this.trackListenedTime(payload.time);
			this.lastDuration = payload.duration;
			void this.maybeScrobble(payload.duration);
		});

		this.on('ended', () => {
			void this.maybeScrobble(this.lastDuration);
		});
	}

	override dispose(): void {
		this.resetTracking();
	}

	/** Seconds of listened time accumulated for the current item so far. */
	listened(): number {
		return this.listenedSeconds;
	}

	/** Whether the current item has already crossed the scrobble threshold. */
	isScrobbled(): boolean {
		return this.hasScrobbled;
	}

	private isMusicItem(item: BasePlaylistItem): item is MusicPlaylistItem {
		return 'name' in item;
	}

	private scrobbler(): IScrobbler<MusicPlaylistItem> {
		return this.opts?.scrobbler ?? this.defaultScrobbler;
	}

	private resetTracking(): void {
		this.currentItem = undefined;
		this.listenedSeconds = 0;
		this.lastTime = 0;
		this.lastDuration = 0;
		this.startedAt = 0;
		this.hasScrobbled = false;
	}

	// A normal playback tick advances by well under a second; anything larger
	// is a seek or a track change and must not count as listened time.
	private trackListenedTime(currentTime: number): void {
		const delta = currentTime - this.lastTime;
		if (delta > 0 && delta < 2) {
			this.listenedSeconds += delta;
		}
		this.lastTime = currentTime;
	}

	private async reportNowPlaying(item: MusicPlaylistItem): Promise<void> {
		try {
			await this.scrobbler().nowPlaying?.(item);
			this.emit('nowPlaying', { item });
		}
		catch (err) {
			this.report({
				code: 'plugin:scrobble/now-playing-failed',
				message: 'Scrobbler backend rejected the nowPlaying() call.',
				cause: err,
				context: { itemId: item.id },
			});
		}
	}

	private async maybeScrobble(duration: number): Promise<void> {
		const item = this.currentItem;
		if (!item || this.hasScrobbled)
			return;

		const minDuration = this.opts?.minDurationSeconds ?? 30;
		if (!Number.isFinite(duration) || duration < minDuration)
			return;

		const ratio = this.opts?.thresholdRatio ?? 0.5;
		const cap = this.opts?.thresholdSeconds ?? 240;
		const threshold = Math.min(duration * ratio, cap);
		if (this.listenedSeconds < threshold)
			return;

		this.hasScrobbled = true;
		const listenedSeconds = this.listenedSeconds;

		try {
			await this.scrobbler().scrobble(item, {
				startedAt: this.startedAt,
				listenedSeconds,
				durationSeconds: duration,
				source: 'user',
			});
			this.emit('scrobbled', {
				item,
				listenedSeconds,
			});
		}
		catch (err) {
			this.report({
				code: 'plugin:scrobble/scrobble-failed',
				message: 'Scrobbler backend rejected the scrobble() call.',
				cause: err,
				context: { itemId: item.id },
			});
		}
	}
}

/** Plugin alias for {@link ScrobblePlugin}. Pass to `addPlugin(scrobblePlugin)`. */
export const scrobblePlugin = ScrobblePlugin;
