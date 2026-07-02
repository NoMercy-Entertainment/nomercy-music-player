// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { NMMusicPlayer } from '../../index';
import type { MusicPlaylistItem } from '../../types';
import type { IPlaylistGenerator } from './IPlaylistGenerator';
import { Plugin } from '@nomercy-entertainment/nomercy-player-core';

export type { IPlaylistGenerator } from './IPlaylistGenerator';
export { LinearPlaylistGenerator } from './linear';
export { SmartShuffleGenerator } from './smart-shuffle';

/** Options for {@link AutoAdvancePlugin}. */
export interface AutoAdvanceOptions {
	/** Master toggle. Default `true`. */
	enabled?: boolean;
	/** On `itemEndingSoon`, peek + load the next item into the next slot. Default `false`. */
	preloadNextOnEnding?: boolean;
	/** On `itemEndingSoon`, hand off to `player.crossfadeTo`. Default `false`. */
	crossfade?: boolean;
	/** Crossfade duration in seconds. Default `0` (hard cut). */
	crossfadeDuration?: number;
	/**
	 * Custom "what's next?" queue-ordering strategy (tag-aware shuffle,
	 * server-driven radio, mood-based ordering, etc). Defaults to the
	 * player's own linear queue order via `next()` / `peekNext()` — passing
	 * a generator does not change the observable default behaviour.
	 */
	generator?: IPlaylistGenerator<MusicPlaylistItem>;
}

type EndedHandler = () => void | Promise<void>;
type PreloadHandler = (next: MusicPlaylistItem | undefined) => void | Promise<void>;
type CrossfadeHandler = (next: MusicPlaylistItem | undefined, duration: number) => void | Promise<void>;

/**
 * Autonomous-advance plugin. Listens to the player's `ended` event to advance
 * the queue, and `itemEndingSoon` to optionally preload + crossfade. Don't
 * register this plugin if your app drives the player from a websocket or
 * Cast sync layer — let the orchestrator drive `next()` instead.
 */
export class AutoAdvancePlugin extends Plugin<NMMusicPlayer, AutoAdvanceOptions> {
	static override readonly id: string = 'auto-advance';
	static override readonly version: string = '2.0.0';
	static override readonly description: string = 'Auto-preload + advance to next item on natural end';

	private endedHandlers: EndedHandler[] = [];
	private preloadHandlers: PreloadHandler[] = [];
	private crossfadeHandlers: CrossfadeHandler[] = [];

	override use(): void {
		this.on('ended', () => {
			if (this.opts?.enabled === false)
				return;
			void this.onEnded();
		});

		this.on('itemEndingSoon', () => {
			if (this.opts?.enabled === false)
				return;
			void this.onItemEndingSoon();
		});
	}

	/**
	 * Force-advance to the next item immediately, regardless of `ended` state.
	 * Uses `opts.generator` when configured; otherwise delegates to the
	 * player's own `next()`.
	 */
	async advance(): Promise<void> {
		const generator = this.opts?.generator;
		if (!generator) {
			await this.player.next({ source: 'auto-advance' });
			return;
		}

		const next = this.resolveGeneratedNext(generator);
		if (next) {
			this.player.item(next, { source: 'auto-advance' });
		}
	}

	/**
	 * Peek the queue head and load it into the next slot. Safe to call any
	 * time — no-ops when there's no next item.
	 */
	async preloadNext(): Promise<void> {
		const next = this.resolveNext();
		if (!next)
			return;

		try {
			await this.player.load(next, { slot: 'next' });
		}
		catch (err) {
			this.logger.warn('preloadNext failed', err);
		}
	}

	/** Register an additional `ended` handler. Runs after the built-in advance. */
	addEndedHandler(fn: EndedHandler): void {
		this.endedHandlers.push(fn);
	}

	/** Register an additional `itemEndingSoon` handler for preload behaviour. */
	addPreloadHandler(fn: PreloadHandler): void {
		this.preloadHandlers.push(fn);
	}

	/** Register an additional `itemEndingSoon` handler for crossfade behaviour. */
	addCrossfadeHandler(fn: CrossfadeHandler): void {
		this.crossfadeHandlers.push(fn);
	}

	/** Resolves "what's next" via `opts.generator` when configured, else `player.peekNext()`. */
	private resolveNext(): MusicPlaylistItem | undefined {
		const generator = this.opts?.generator;
		return generator ? this.resolveGeneratedNext(generator) : this.player.peekNext();
	}

	private resolveGeneratedNext(generator: IPlaylistGenerator<MusicPlaylistItem>): MusicPlaylistItem | undefined {
		const items = this.player.queue();
		const currentIndex = this.player.index();
		const nextIndex = generator.next(items, currentIndex);

		return nextIndex === undefined ? undefined : items[nextIndex];
	}

	private async onEnded(): Promise<void> {
		try {
			await this.advance();
		}
		catch (err) {
			this.logger.warn('advance() failed on ended', err);
		}

		for (const fn of this.endedHandlers) {
			try { await fn(); }
			catch (err) { this.logger.warn('ended handler threw', err); }
		}
	}

	private async onItemEndingSoon(): Promise<void> {
		const next = this.resolveNext();
		const duration = this.opts?.crossfadeDuration ?? 0;

		if (this.opts?.preloadNextOnEnding === true) {
			await this.preloadNext();
		}

		if (this.opts?.crossfade === true && next) {
			try {
				await this.player.crossfadeTo(next, { duration });
			}
			catch (err) {
				this.logger.warn('crossfadeTo failed', err);
			}
		}

		for (const fn of this.preloadHandlers) {
			try { await fn(next); }
			catch (err) { this.logger.warn('preload handler threw', err); }
		}

		for (const fn of this.crossfadeHandlers) {
			try { await fn(next, duration); }
			catch (err) { this.logger.warn('crossfade handler threw', err); }
		}
	}
}

/** Plugin alias for {@link AutoAdvancePlugin}. Pass to `addPlugin(autoAdvancePlugin)`. */
export const autoAdvancePlugin = AutoAdvancePlugin;
