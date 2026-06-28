// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * V1MusicCompatPlugin — behavioral depth tests (Slice 09).
 *
 * These tests focus on three contracts that were identified as gaps:
 *  (1) `currentSong` property getter returns the same value as `player.item()`.
 *  (2) Deprecation warning fires ONCE for `currentSong` across repeated reads.
 *  (3) `song` event bridge forwards the item from the v2 `item` event payload.
 *
 * The broader shim surface (seek, volume, EQ stubs, event bridges for time /
 * repeat / shuffle / mute / volume) is exercised in v1-compat.test.ts.  These
 * tests exist to pin the specific getter/event-bridge contracts the slice spec
 * calls out by name.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MusicPlaylistItem } from '../../types';
import { NMMusicPlayer } from '../../index';
import { V1MusicCompatPlugin } from '../../plugins/v1-compat';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Cast to dynamic accessor map so shims are reachable without TS errors. */
function dynamic(player: NMMusicPlayer): Record<string, unknown> {
	return player as unknown as Record<string, unknown>;
}

/**
 * Register a v1 event via the shimmed on() interceptor installed by
 * V1MusicCompatPlugin.  The interceptor replaces `player.on` at plugin init,
 * so calling the replaced function routes v1 event names through the bridge.
 */
function shimOn(player: NMMusicPlayer, event: string, fn: (data: unknown) => void): void {
	const onFn = dynamic(player)['on'];
	if (typeof onFn !== 'function') {
		throw new TypeError('player.on not found');
	}
	(onFn as (ev: string, cb: (d: unknown) => void) => void)(event, fn);
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('V1MusicCompatPlugin — depth', () => {
	beforeEach(() => {
		(NMMusicPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		const div = document.createElement('div');
		div.id = 'test';
		document.body.appendChild(div);
		vi.spyOn(console, 'warn').mockImplementation(() => undefined);
	});

	afterEach(() => {
		(NMMusicPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		document.body.innerHTML = '';
		vi.restoreAllMocks();
	});

	// ── Test 7: currentSong getter return value ────────────────────────────

	describe('currentSong getter delegates to item()', () => {
		it('returns undefined when no track is set', async () => {
			const player = new NMMusicPlayer('test').setup({});
			player.addPlugin(V1MusicCompatPlugin);
			await player.ready();

			const result = dynamic(player)['currentSong'];
			expect(result).toBeUndefined();

			player.dispose();
		});

		it('returns the same object as player.item() after a track is queued', async () => {
			const player = new NMMusicPlayer('test').setup({});
			player.addPlugin(V1MusicCompatPlugin);
			await player.ready();

			const testTrack: MusicPlaylistItem = { id: 'depth-01', name: 'Depth Track' };
			player.queue([testTrack]);

			const v2Result = player.item();
			const v1Result = dynamic(player)['currentSong'];

			expect(v1Result).toBe(v2Result);

			player.dispose();
		});
	});

	// ── Test 8: deprecation warning fires at most once per distinct v1 API ──

	describe('deprecation warning fires at most once for currentSong across repeated reads', () => {
		it('repeated reads of currentSong never add a second warning', async () => {
			const player = new NMMusicPlayer('test').setup({});
			player.addPlugin(V1MusicCompatPlugin);
			await player.ready();

			// First read — may or may not warn (module-level once-guard may already have
			// fired in a prior test because _warnedSet is module-scoped and never resets).
			void dynamic(player)['currentSong'];
			const countAfterFirst = (console.warn as ReturnType<typeof vi.spyOn>).mock.calls
				.filter((args: unknown[]) => String(args[0]).includes('"currentSong"')).length;

			// Second and third reads must NEVER add another warning.
			void dynamic(player)['currentSong'];
			void dynamic(player)['currentSong'];
			const countAfterThird = (console.warn as ReturnType<typeof vi.spyOn>).mock.calls
				.filter((args: unknown[]) => String(args[0]).includes('"currentSong"')).length;

			expect(countAfterThird).toBe(countAfterFirst);

			player.dispose();
		});
	});

	// ── Test 9: song event bridge forwards v1 payload ──────────────────────

	describe('song event bridge', () => {
		it('listener registered under v1 "song" receives the item when v2 "item" fires', async () => {
			const player = new NMMusicPlayer('test').setup({});
			player.addPlugin(V1MusicCompatPlugin);
			await player.ready();

			const received: unknown[] = [];
			shimOn(player, 'song', (data) => { received.push(data); });

			const fakeItem: MusicPlaylistItem = { id: 'bridge-test', name: 'Bridge Song' };
			player.emit('item' as never, { item: fakeItem, index: 0 } as never);

			expect(received).toHaveLength(1);
			expect((received[0] as MusicPlaylistItem).id).toBe('bridge-test');
			expect((received[0] as MusicPlaylistItem).name).toBe('Bridge Song');

			player.dispose();
		});

		it('listener registered under v1 "song" receives null when item is absent', async () => {
			const player = new NMMusicPlayer('test').setup({});
			player.addPlugin(V1MusicCompatPlugin);
			await player.ready();

			const received: unknown[] = [];
			shimOn(player, 'song', (data) => { received.push(data); });

			// Emit an item event with no item field — reshaper returns null.
			player.emit('item' as never, { index: 0 } as never);

			expect(received).toHaveLength(1);
			expect(received[0]).toBeNull();

			player.dispose();
		});
	});
});
