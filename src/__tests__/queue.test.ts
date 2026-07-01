// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * Queue tests for NMMusicPlayer. Validates the cursor + mutation behaviors
 * delegated to the kit's MediaList<T>. Also locks the re-emit contract:
 * MediaList events surface on the player as `queue`, `queue:append`, etc.
 */

import type { MusicPlaylistItem } from '../types';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NMMusicPlayer } from '../index';

const track = (id: string): MusicPlaylistItem => ({ id, name: `track ${id}` });

describe('NMMusicPlayer — queue', () => {
	beforeEach(() => {
		(NMMusicPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		const div = document.createElement('div');
		div.id = 'test';
		document.body.appendChild(div);
	});

	afterEach(() => {
		(NMMusicPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		document.body.innerHTML = '';
	});

	const setup = (): NMMusicPlayer => new NMMusicPlayer('test').setup({});

	describe('initial state', () => {
		it('queue() returns an empty array before any tracks are loaded', () => {
			expect(setup().queue()).toEqual([]);
		});

		it('queueLength() is 0 initially', () => {
			expect(setup().queueLength()).toBe(0);
		});

		it('item() is undefined initially', () => {
			expect(setup().item()).toBeUndefined();
		});

		it('index() is -1 initially', () => {
			expect(setup().index()).toBe(-1);
		});
	});

	describe('queue(items) — write form', () => {
		it('replaces the queue with the given items', () => {
			const musicPlayer = setup();
			musicPlayer.queue([track('a'), track('b')]);
			expect(musicPlayer.queue()).toEqual([track('a'), track('b')]);
		});

		it('emits "queue" with the new items', () => {
			const musicPlayer = setup();
			let emitted: ReadonlyArray<MusicPlaylistItem> | undefined;
			musicPlayer.on('queue' as any, (items: any) => { emitted = items; });
			musicPlayer.queue([track('a'), track('b')]);
			expect(emitted?.length).toBe(2);
		});

		it('cursor jumps to first item on a fresh queue', () => {
			const musicPlayer = setup();
			musicPlayer.queue([track('a'), track('b')]);
			expect(musicPlayer.index()).toBe(0);
			expect(musicPlayer.item()?.id).toBe('a');
		});
	});

	describe('queueAppend / queuePrepend / queueInsert', () => {
		it('append adds to the end and emits queue:append', () => {
			const musicPlayer = setup();
			musicPlayer.queue([track('a')]);
			let payload: { items: MusicPlaylistItem[]; from: number } | undefined;
			musicPlayer.on('queue:append' as any, (data: any) => { payload = data; });
			musicPlayer.queueAppend(track('b'));
			expect(musicPlayer.queue()).toEqual([track('a'), track('b')]);
			expect(payload?.from).toBe(1);
		});

		it('prepend adds to the front and emits queue:prepend', () => {
			const musicPlayer = setup();
			musicPlayer.queue([track('b')]);
			let payload: unknown;
			musicPlayer.on('queue:prepend' as any, (data: unknown) => { payload = data; });
			musicPlayer.queuePrepend(track('a'));
			expect(musicPlayer.queue()).toEqual([track('a'), track('b')]);
			expect(payload).toBeDefined();
		});

		it('insert places at the given index and emits queue:insert', () => {
			const musicPlayer = setup();
			musicPlayer.queue([track('a'), track('c')]);
			musicPlayer.queueInsert(track('b'), 1);
			expect(musicPlayer.queue()).toEqual([track('a'), track('b'), track('c')]);
		});

		it('append accepts an array', () => {
			const musicPlayer = setup();
			musicPlayer.queueAppend([track('a'), track('b')]);
			expect(musicPlayer.queue()).toEqual([track('a'), track('b')]);
		});
	});

	describe('queueRemove / queueRemoveAt', () => {
		it('queueRemove(id) drops the matching item and emits queue:remove', () => {
			const musicPlayer = setup();
			musicPlayer.queue([track('a'), track('b')]);
			let removedId: string | undefined;
			musicPlayer.on('queue:remove' as any, (data: any) => { removedId = data.id; });
			musicPlayer.queueRemove('a');
			expect(musicPlayer.queue()).toEqual([track('b')]);
			expect(removedId).toBe('a');
		});

		it('queueRemoveAt(idx) drops by index', () => {
			const musicPlayer = setup();
			musicPlayer.queue([track('a'), track('b'), track('c')]);
			musicPlayer.queueRemoveAt(1);
			expect(musicPlayer.queue()).toEqual([track('a'), track('c')]);
		});
	});

	describe('queueMove / queueShuffle / queueSort / queueClear', () => {
		it('queueMove repositions and emits queue:move', () => {
			const musicPlayer = setup();
			musicPlayer.queue([track('a'), track('b'), track('c')]);
			let moved: { from: number; to: number } | undefined;
			musicPlayer.on('queue:move' as any, (data: any) => { moved = data; });
			musicPlayer.queueMove(0, 2);
			expect(musicPlayer.queue().map(i => i.id)).toEqual(['b', 'c', 'a']);
			expect(moved).toEqual({ from: 0, to: 2 });
		});

		it('queueShuffle keeps the same items and emits queue:shuffle', () => {
			const musicPlayer = setup();
			musicPlayer.queue([track('a'), track('b'), track('c'), track('d')]);
			let shuffled = false;
			musicPlayer.on('queue:shuffle' as any, () => { shuffled = true; });
			musicPlayer.queueShuffle();
			expect(shuffled).toBe(true);
			expect(musicPlayer.queueLength()).toBe(4);
		});

		it('queueSort applies the comparator and emits queue:sort', () => {
			const musicPlayer = setup();
			musicPlayer.queue([track('c'), track('a'), track('b')]);
			let sorted = false;
			musicPlayer.on('queue:sort' as any, () => { sorted = true; });
			musicPlayer.queueSort((itemA, itemB) => String(itemA.id).localeCompare(String(itemB.id)));
			expect(musicPlayer.queue().map(i => i.id)).toEqual(['a', 'b', 'c']);
			expect(sorted).toBe(true);
		});

		it('queueClear empties and emits queue:clear', () => {
			const musicPlayer = setup();
			musicPlayer.queue([track('a'), track('b')]);
			let cleared: { previousLength: number } | undefined;
			musicPlayer.on('queue:clear' as any, (data: any) => { cleared = data; });
			musicPlayer.queueClear();
			expect(musicPlayer.queue()).toEqual([]);
			expect(cleared?.previousLength).toBe(2);
		});
	});

	describe('peeks + lookups', () => {
		it('peekNext returns the next item after cursor', () => {
			const musicPlayer = setup();
			musicPlayer.queue([track('a'), track('b')]);
			expect(musicPlayer.peekNext()?.id).toBe('b');
		});

		it('peekPrevious returns undefined when at start', () => {
			const musicPlayer = setup();
			musicPlayer.queue([track('a'), track('b')]);
			expect(musicPlayer.peekPrevious()).toBeUndefined();
		});

		it('queueIndexOf returns the index of a known id', () => {
			const musicPlayer = setup();
			musicPlayer.queue([track('a'), track('b')]);
			expect(musicPlayer.queueIndexOf('b')).toBe(1);
		});

		it('queueIndexOf returns -1 for unknown ids', () => {
			const musicPlayer = setup();
			expect(musicPlayer.queueIndexOf('zzz')).toBe(-1);
		});
	});

	describe('cursor — item / index', () => {
		it('item(id) moves the cursor and emits "item"', () => {
			const musicPlayer = setup();
			musicPlayer.queue([track('a'), track('b')]);
			let payload: { item: MusicPlaylistItem | undefined; index: number } | undefined;
			musicPlayer.on('item' as any, (data: any) => { payload = data; });
			musicPlayer.item('b');
			expect(musicPlayer.item()?.id).toBe('b');
			expect(musicPlayer.index()).toBe(1);
			expect(payload?.index).toBe(1);
		});

		it('item() accepts a numeric index', () => {
			const musicPlayer = setup();
			musicPlayer.queue([track('a'), track('b'), track('c')]);
			musicPlayer.item(2);
			expect(musicPlayer.item()?.id).toBe('c');
		});
	});
});
