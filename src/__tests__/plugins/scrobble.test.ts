// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * `ScrobblePlugin` twin test suite (StubPlayer via `describePlugin` + a real
 * `NMMusicPlayer` via `describePluginAgainst`).
 *
 * Every assertion checks the OUTCOME recorded on a fake `IScrobbler` (which
 * entries it collected, and their shape) rather than that a mock function was
 * merely invoked — proving the threshold math actually gates the call.
 */

import type { IScrobbler, ScrobbleContext } from '../../plugins/scrobble';
import type { MusicPlaylistItem } from '../../types';
import {
	describePlugin,
	describePluginAgainst,
} from '@nomercy-entertainment/nomercy-player-core/testing';
import { describe, expect, it } from 'vitest';
import { NMMusicPlayer } from '../../index';
import { NoopScrobbler, ScrobblePlugin } from '../../plugins/scrobble';

function item(id: string, extra?: Partial<MusicPlaylistItem>): MusicPlaylistItem {
	return { id, name: `item ${id}`, ...extra };
}

class FakeScrobbler implements IScrobbler<MusicPlaylistItem> {
	readonly id = 'fake';
	readonly nowPlayingCalls: MusicPlaylistItem[] = [];
	readonly scrobbles: Array<{ item: MusicPlaylistItem; context: ScrobbleContext }> = [];

	async nowPlaying(playedItem: MusicPlaylistItem): Promise<void> {
		this.nowPlayingCalls.push(playedItem);
	}

	async scrobble(playedItem: MusicPlaylistItem, context: ScrobbleContext): Promise<void> {
		this.scrobbles.push({ item: playedItem, context });
	}
}

/** Drive one-second `time` ticks from `fromSecond` through `throughSecond` (both inclusive), at the given `duration`. */
function tick(player: { emit: (event: string, data: unknown) => void }, throughSecond: number, duration: number, fromSecond = 1): void {
	for (let seconds = fromSecond; seconds <= throughSecond; seconds++) {
		player.emit('time', { time: seconds, percentage: 0, position: seconds, duration, remaining: duration - seconds });
	}
}

// ── NoopScrobbler ────────────────────────────────────────────────────────────────

describe('NoopScrobbler', () => {
	it('scrobble() and nowPlaying() resolve without throwing or producing side effects', async () => {
		const scrobbler = new NoopScrobbler();
		const seed = item('a');

		await expect(scrobbler.scrobble(seed, {
			startedAt: 0,
			listenedSeconds: 120,
			durationSeconds: 240,
			source: 'user',
		})).resolves.toBeUndefined();

		await expect(scrobbler.nowPlaying!(seed)).resolves.toBeUndefined();
	});
});

// ── ScrobblePlugin — layer 1 (StubPlayer) ─────────────────────────────────────────

describePlugin(ScrobblePlugin, (ctx) => {
	it('reports nowPlaying immediately on item change', () => {
		const fake = new FakeScrobbler();
		ctx.plugin.options({ scrobbler: fake });

		ctx.player.emit('item', { item: item('a'), index: 0 });

		expect(fake.nowPlayingCalls.map(playedItem => playedItem.id)).toEqual(['a']);
		expect(fake.scrobbles).toHaveLength(0);
	});

	it('does NOT scrobble before the threshold is reached', () => {
		const fake = new FakeScrobbler();
		ctx.plugin.options({ scrobbler: fake });

		ctx.player.emit('item', { item: item('a'), index: 0 });
		// 200s track — 50% threshold is 100s. Only tick 40s of listened time.
		tick(ctx.player as unknown as { emit: (event: string, data: unknown) => void }, 40, 200);

		expect(fake.scrobbles).toHaveLength(0);
		expect(ctx.plugin.listened()).toBeCloseTo(40, 0);
		expect(ctx.plugin.isScrobbled()).toBe(false);
	});

	it('scrobbles exactly once accumulated listened time crosses 50% of duration', () => {
		const fake = new FakeScrobbler();
		ctx.plugin.options({ scrobbler: fake });

		ctx.player.emit('item', { item: item('a'), index: 0 });
		// 200s track — 50% threshold is 100s.
		tick(ctx.player as unknown as { emit: (event: string, data: unknown) => void }, 105, 200);

		expect(fake.scrobbles).toHaveLength(1);
		expect(fake.scrobbles[0]!.item.id).toBe('a');
		expect(fake.scrobbles[0]!.context.listenedSeconds).toBeGreaterThanOrEqual(100);
		expect(ctx.plugin.isScrobbled()).toBe(true);

		// Further ticks must not scrobble a second time for the same item.
		tick(ctx.player as unknown as { emit: (event: string, data: unknown) => void }, 115, 200, 106);
		expect(fake.scrobbles).toHaveLength(1);
	});

	it('caps the threshold at thresholdSeconds (4-minute rule) on a long track', () => {
		const fake = new FakeScrobbler();
		ctx.plugin.options({ scrobbler: fake, thresholdSeconds: 5 });

		ctx.player.emit('item', { item: item('a'), index: 0 });

		tick(ctx.player as unknown as { emit: (event: string, data: unknown) => void }, 4, 600);
		expect(fake.scrobbles).toHaveLength(0);

		tick(ctx.player as unknown as { emit: (event: string, data: unknown) => void }, 5, 600, 5);
		expect(fake.scrobbles).toHaveLength(1);
	});

	it('never scrobbles an item shorter than minDurationSeconds, even after it ends', () => {
		const fake = new FakeScrobbler();
		ctx.plugin.options({ scrobbler: fake, minDurationSeconds: 30 });

		ctx.player.emit('item', { item: item('a'), index: 0 });
		tick(ctx.player as unknown as { emit: (event: string, data: unknown) => void }, 20, 20);
		ctx.player.emit('ended');

		expect(fake.scrobbles).toHaveLength(0);
	});

	it('resets tracking on the next item — listened time does not carry over', () => {
		const fake = new FakeScrobbler();
		ctx.plugin.options({ scrobbler: fake });

		ctx.player.emit('item', { item: item('a'), index: 0 });
		tick(ctx.player as unknown as { emit: (event: string, data: unknown) => void }, 50, 200);
		expect(fake.scrobbles).toHaveLength(0);

		ctx.player.emit('item', { item: item('b'), index: 1 });

		expect(fake.nowPlayingCalls.map(playedItem => playedItem.id)).toEqual(['a', 'b']);
		expect(ctx.plugin.listened()).toBe(0);
		expect(fake.scrobbles).toHaveLength(0);
	});
});

// ── ScrobblePlugin — layer 3 (real NMMusicPlayer) ─────────────────────────────────

describePluginAgainst(ScrobblePlugin, (ctx) => {
	it('nowPlaying + scrobble fire through the real player event pipeline once past threshold', async () => {
		const fake = new FakeScrobbler();
		ctx.plugin.options({ scrobbler: fake });

		ctx.player.queue([item('a')]);
		ctx.player.item('a');
		tick(ctx.player as unknown as { emit: (event: string, data: unknown) => void }, 105, 200);

		expect(fake.nowPlayingCalls.map(playedItem => playedItem.id)).toEqual(['a']);
		expect(fake.scrobbles).toHaveLength(1);
		expect(fake.scrobbles[0]!.item.id).toBe('a');
	});

	it('does not scrobble a real item before the threshold is reached', async () => {
		const fake = new FakeScrobbler();
		ctx.plugin.options({ scrobbler: fake });

		ctx.player.queue([item('a')]);
		ctx.player.item('a');
		tick(ctx.player as unknown as { emit: (event: string, data: unknown) => void }, 30, 200);

		expect(fake.nowPlayingCalls).toHaveLength(1);
		expect(fake.scrobbles).toHaveLength(0);
	});
}, {
	player: async () => {
		const div = document.createElement('div');
		div.id = 'scrobble-real-test';
		document.body.appendChild(div);
		const realPlayer = new NMMusicPlayer('scrobble-real-test').setup({});
		await realPlayer.ready();
		return realPlayer;
	},
	teardown: (player) => {
		player.dispose();
		(NMMusicPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		document.body.innerHTML = '';
	},
});
