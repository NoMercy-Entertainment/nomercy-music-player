// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type {
	BasePlaylistItem,
	Cue,
	CueList,
	ICueParser,
} from '@nomercy-entertainment/nomercy-player-core';

import type { NMMusicPlayer } from '../../index';
import type { MusicPlaylistItem } from '../../types';
import { CueTracker, Plugin } from '@nomercy-entertainment/nomercy-player-core';

/** Events emitted by {@link LyricsPlugin}. */
export interface LyricsEvents {
	/** Fired once the cue list is fetched, parsed, and the tracker is attached. */
	loaded: { count: number };
	line: { text: string; [key: string]: unknown };
	lineEnter: { text: string; [key: string]: unknown };
	lineExit: { text: string; [key: string]: unknown };
}

/** Options for {@link LyricsPlugin}. */
export interface LyricsOptions {
	/** Resolve a track to a lyrics URL. Defaults to `track.lyricsUrl`. */
	getLyricsUrl?: (track: MusicPlaylistItem) => string | undefined;
	/** Auto-fetch on `current` event. Default `true`. */
	autoFetch?: boolean;
}

interface LyricPayload {
	text: string;
	[key: string]: unknown;
}

/**
 * Synced-lyrics plugin. On every `current` event, resolves the track's
 * `lyricsUrl` (or a custom resolver), fetches via the auth-aware kit fetch,
 * parses through the kit's cue parser registry, and attaches a `CueTracker`.
 *
 * Tracker `enter` / `exit` events are bridged to plugin-namespaced events:
 *
 *  - `plugin:lyrics:line`        — emitted on every line enter (active line)
 *  - `plugin:lyrics:lineEnter`   — same payload as `line`, mirrors tracker `enter`
 *  - `plugin:lyrics:lineExit`    — emitted when a line goes inactive
 */
export class LyricsPlugin<T extends MusicPlaylistItem = MusicPlaylistItem> extends Plugin<NMMusicPlayer<T>, LyricsOptions, LyricsEvents> {
	static override readonly id: string = 'lyrics';
	static override readonly version: string = '2.0.0';
	static override readonly description: string = 'Synced lyrics via cue parser registry + CueTracker';

	private tracker?: CueTracker<LyricPayload>;
	private cueList?: CueList<LyricPayload>;
	private activeCue?: Cue<LyricPayload>;

	/** Attaches the `item` listener to auto-fetch lyrics when a new track loads. */
	override use(): void {
		this.on('item', (payload) => {
			if (this.opts?.autoFetch === false)
				return;

			const item = payload?.item;
			if (!item || !this.isMusicItem(item)) {
				this.clear();
				return;
			}

			const url = this.resolveLyricsUrl(item);
			if (!url) {
				this.clear();
				return;
			}
			void this.fetchAndAttach(url);
		});
	}

	/** Disposes the active cue tracker and clears all lyric state. */
	override dispose(): void {
		this.clear();
	}

	/** Currently-active line cue payload, or `undefined` between lines. */
	current(): LyricPayload | undefined {
		return this.activeCue?.payload;
	}

	/** All cues for the current track (empty list if none loaded). */
	all(): ReadonlyArray<Cue<LyricPayload>> {
		return this.cueList?.cues ?? [];
	}

	/** Tear down the active cue tracker without disposing the plugin. */
	clear(): void {
		if (this.tracker) {
			this.tracker.dispose();
			this.tracker = undefined;
		}
		this.cueList = undefined;
		this.activeCue = undefined;
	}

	/**
	 * Explicit fetcher — takes precedence over `current`-event auto-fetch.
	 * Resolves once the cue tracker is attached. Returns the parsed cue list
	 * (or `undefined` if fetch/parse failed and was reported via `report`).
	 */
	async fetchLyrics(url: string): Promise<CueList<LyricPayload> | undefined> {
		return this.fetchAndAttach(url);
	}

	/**
	 * Type predicate: narrows a TS generic intersection to `T` by checking
	 * that the required `name` field (from `MusicPlaylistItem`) is present.
	 * Needed because `Plugin.on('item', ...)` infers the payload item as a
	 * distributive intersection when `T` is a free generic parameter.
	 */
	private isMusicItem(item: BasePlaylistItem): item is T {
		return 'name' in item;
	}

	private resolveLyricsUrl(item: T): string | undefined {
		const resolver = this.opts?.getLyricsUrl;
		if (typeof resolver === 'function')
			return resolver(item);
		return item.lyricsUrl;
	}

	private async fetchAndAttach(url: string): Promise<CueList<LyricPayload> | undefined> {
		const parser = this.resolveParser(url);
		if (!parser) {
			this.report({
				code: 'plugin:lyrics/no-parser',
				message: `No cue parser registered for ${url}`,
				context: { url },
			});
			return undefined;
		}
		let raw: string;
		try {
			raw = await this.fetch(url);
		}
		catch (err) {
			this.report({
				code: 'plugin:lyrics/fetch-failed',
				message: `Failed to fetch lyrics from ${url}`,
				cause: err,
				context: { url },
			});
			return undefined;
		}
		const list = parser.parse(raw) as CueList<LyricPayload>;
		this.attach(list);
		return list;
	}

	private resolveParser(url: string): ICueParser | undefined {
		return this.player.resolveCueParser(url);
	}

	private attach(list: CueList<LyricPayload>): void {
		this.clear();
		this.cueList = list;
		const tracker = new CueTracker<LyricPayload>(list);
		this.tracker = tracker;
		tracker.on('enter', (cue) => {
			this.activeCue = cue;
			this.emit('line', cue.payload);
			this.emit('lineEnter', cue.payload);
		});
		tracker.on('exit', (cue) => {
			if (this.activeCue === cue)
				this.activeCue = undefined;
			this.emit('lineExit', cue.payload);
		});
		tracker.attach(this.player);
		this.emit('loaded', { count: list.cues.length });
	}
}

/** Plugin alias for {@link LyricsPlugin}. Pass to `addPlugin(lyricsPlugin)`. */
export const lyricsPlugin = LyricsPlugin;
