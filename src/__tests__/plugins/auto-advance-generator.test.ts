// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * `IPlaylistGenerator` unit tests (moved from music-domain-ports.test.ts
 * alongside their new home under `plugins/auto-advance/`) plus the
 * `AutoAdvancePlugin` `opts.generator` wiring test.
 *
 * Covers:
 *   - LinearPlaylistGenerator.next() — sequential + end-of-queue
 *   - SmartShuffleGenerator.next() — does not return current on non-singleton queue
 *   - AutoAdvancePlugin with opts.generator — advance() moves the cursor
 *     using the custom generator instead of player.next()
 *   - AutoAdvancePlugin without opts.generator — advance() still calls
 *     player.next() (default behaviour is unchanged)
 */

import type { IPlaylistGenerator } from '../../plugins/auto-advance';
import type { MusicPlaylistItem } from '../../types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NMMusicPlayer } from '../../index';
import { AutoAdvancePlugin, LinearPlaylistGenerator, SmartShuffleGenerator } from '../../plugins/auto-advance';

function track(id: string): MusicPlaylistItem {
	return { id, name: `track ${id}` };
}

// ── LinearPlaylistGenerator ─────────────────────────────────────────────────────

describe('LinearPlaylistGenerator', () => {
	it('next(items, 0) returns index 1 (the item after current)', () => {
		const gen = new LinearPlaylistGenerator();
		const items: MusicPlaylistItem[] = [track('a'), track('b'), track('c')];

		expect(gen.next(items, 0)).toBe(1);
	});

	/**
	 * FINDING: LinearPlaylistGenerator returns undefined at end of queue (no ring).
	 * AutoAdvancePlugin must handle undefined gracefully when a generator is set.
	 */
	it('next() at end of queue returns undefined (no ring behavior)', () => {
		const gen = new LinearPlaylistGenerator();
		const items: MusicPlaylistItem[] = [track('a'), track('b'), track('c')];

		expect(gen.next(items, 2)).toBeUndefined();
	});

	it('previous(items, 1) returns index 0; previous(items, 0) returns undefined', () => {
		const gen = new LinearPlaylistGenerator();
		const items: MusicPlaylistItem[] = [track('a'), track('b'), track('c')];

		expect(gen.previous(items, 1)).toBe(0);
		expect(gen.previous(items, 0)).toBeUndefined();
	});
});

// ── SmartShuffleGenerator ────────────────────────────────────────────────────────

describe('SmartShuffleGenerator', () => {
	it('next() does not return currentIndex on a non-singleton queue', () => {
		const gen = new SmartShuffleGenerator();
		const items: MusicPlaylistItem[] = [track('a'), track('b'), track('c')];

		for (let i = 0; i < 20; i++) {
			const next = gen.next(items, 0);
			expect(next).not.toBe(0);
		}
	});
});

// ── AutoAdvancePlugin — opts.generator wiring ───────────────────────────────────

describe('AutoAdvancePlugin — opts.generator wiring', () => {
	beforeEach(() => {
		(NMMusicPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		const div = document.createElement('div');
		div.id = 'generator-test';
		document.body.appendChild(div);
	});

	afterEach(() => {
		(NMMusicPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		document.body.innerHTML = '';
	});

	const setup = (): NMMusicPlayer => new NMMusicPlayer('generator-test').setup({});

	it('advance() moves the cursor via the custom generator instead of player.next()', async () => {
		const musicPlayer = setup();
		musicPlayer.queue([track('a'), track('b'), track('c')]);
		musicPlayer.item(2);

		const reverseGenerator: IPlaylistGenerator<MusicPlaylistItem> = {
			id: 'reverse',
			next: (items, currentIndex) => (currentIndex <= 0 ? undefined : currentIndex - 1),
			previous: () => undefined,
		};

		musicPlayer.addPlugin(AutoAdvancePlugin, { generator: reverseGenerator });
		await musicPlayer.ready();

		const nextSpy = vi.spyOn(musicPlayer, 'next');
		const instance = musicPlayer.getPlugin(AutoAdvancePlugin)!;

		await instance.advance();

		expect(nextSpy).not.toHaveBeenCalled();
		expect(musicPlayer.index()).toBe(1);
		expect(musicPlayer.item()?.id).toBe('b');
	});

	it('advance() falls through to player.next() when no generator is passed (default behavior unchanged)', async () => {
		const musicPlayer = setup();
		musicPlayer.queue([track('a'), track('b'), track('c')]);

		musicPlayer.addPlugin(AutoAdvancePlugin);
		await musicPlayer.ready();

		const nextSpy = vi.spyOn(musicPlayer, 'next').mockResolvedValue(undefined);
		const instance = musicPlayer.getPlugin(AutoAdvancePlugin)!;

		await instance.advance();

		expect(nextSpy).toHaveBeenCalledOnce();
	});

	it('ended → advance() with a generator that returns undefined does not move the cursor', async () => {
		const musicPlayer = setup();
		musicPlayer.queue([track('a'), track('b')]);
		musicPlayer.item(1);

		const exhaustedGenerator: IPlaylistGenerator<MusicPlaylistItem> = {
			id: 'exhausted',
			next: () => undefined,
			previous: () => undefined,
		};

		musicPlayer.addPlugin(AutoAdvancePlugin, { generator: exhaustedGenerator });
		await musicPlayer.ready();

		musicPlayer.emit('ended' as any, undefined as any);
		await new Promise<void>(resolve => setTimeout(resolve, 0));

		expect(musicPlayer.index()).toBe(1);
		expect(musicPlayer.item()?.id).toBe('b');
	});
});
