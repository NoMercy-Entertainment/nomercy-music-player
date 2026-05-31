import type { NMMusicPlayer } from '../../index';
import type { MusicPlaylistItem } from '../../types';
import { Plugin } from '@nomercy-entertainment/nomercy-player-core';

/** Options for {@link AutoAdvancePlugin}. */
export interface AutoAdvanceOptions {
	/** Master toggle. Default `true`. */
	enabled?: boolean;
	/** On `trackEndingSoon`, peek + load the next track into the next slot. Default `false`. */
	preloadNextOnEnding?: boolean;
	/** On `trackEndingSoon`, hand off to `player.crossfadeTo`. Default `false`. */
	crossfade?: boolean;
	/** Crossfade duration in seconds. Default `0` (hard cut). */
	crossfadeDuration?: number;
}

type EndedHandler = () => void | Promise<void>;
type PreloadHandler = (next: MusicPlaylistItem | undefined) => void | Promise<void>;
type CrossfadeHandler = (next: MusicPlaylistItem | undefined, duration: number) => void | Promise<void>;

/**
 * Autonomous-advance plugin. Listens to the player's `ended` event to advance
 * the queue, and `trackEndingSoon` to optionally preload + crossfade. Don't
 * register this plugin if your app drives the player from a websocket or
 * Cast sync layer — let the orchestrator drive `next()` instead.
 */
export class AutoAdvancePlugin extends Plugin<NMMusicPlayer, AutoAdvanceOptions> {
	static override readonly id: string = 'auto-advance';
	static override readonly version: string = '2.0.0';
	static override readonly description: string = 'Auto-preload + advance to next track on natural end';

	private endedHandlers: EndedHandler[] = [];
	private preloadHandlers: PreloadHandler[] = [];
	private crossfadeHandlers: CrossfadeHandler[] = [];

	override use(): void {
		this.on('ended', () => {
			if (this.opts?.enabled === false)
				return;
			void this.onEnded();
		});

		this.on('trackEndingSoon', () => {
			if (this.opts?.enabled === false)
				return;
			void this.onTrackEndingSoon();
		});
	}

	/** Force-advance to the next track immediately, regardless of `ended` state. */
	advance(): Promise<void> {
		return this.player.next({ source: 'auto-advance' });
	}

	/**
	 * Peek the queue head and load it into the next slot. Safe to call any
	 * time — no-ops when there's no next track.
	 */
	async preloadNext(): Promise<void> {
		const next = this.player.peekNext();
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

	/** Register an additional `trackEndingSoon` handler for preload behaviour. */
	addPreloadHandler(fn: PreloadHandler): void {
		this.preloadHandlers.push(fn);
	}

	/** Register an additional `trackEndingSoon` handler for crossfade behaviour. */
	addCrossfadeHandler(fn: CrossfadeHandler): void {
		this.crossfadeHandlers.push(fn);
	}

	private async onEnded(): Promise<void> {
		try {
			await this.player.next({ source: 'auto-advance' });
		}
		catch (err) {
			this.logger.warn('next() failed on ended', err);
		}

		for (const fn of this.endedHandlers) {
			try { await fn(); }
			catch (err) { this.logger.warn('ended handler threw', err); }
		}
	}

	private async onTrackEndingSoon(): Promise<void> {
		const next = this.player.peekNext();
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
