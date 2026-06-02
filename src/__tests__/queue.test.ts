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
			const p = setup();
			p.queue([track('a'), track('b')]);
			expect(p.queue()).toEqual([track('a'), track('b')]);
		});

		it('emits "queue" with the new items', () => {
			const p = setup();
			let emitted: ReadonlyArray<MusicPlaylistItem> | undefined;
			p.on('queue' as any, (items: any) => { emitted = items; });
			p.queue([track('a'), track('b')]);
			expect(emitted?.length).toBe(2);
		});

		it('cursor jumps to first item on a fresh queue', () => {
			const p = setup();
			p.queue([track('a'), track('b')]);
			expect(p.index()).toBe(0);
			expect(p.item()?.id).toBe('a');
		});
	});

	describe('queueAppend / queuePrepend / queueInsert', () => {
		it('append adds to the end and emits queue:append', () => {
			const p = setup();
			p.queue([track('a')]);
			let payload: { items: MusicPlaylistItem[]; from: number } | undefined;
			p.on('queue:append' as any, (data: any) => { payload = data; });
			p.queueAppend(track('b'));
			expect(p.queue()).toEqual([track('a'), track('b')]);
			expect(payload?.from).toBe(1);
		});

		it('prepend adds to the front and emits queue:prepend', () => {
			const p = setup();
			p.queue([track('b')]);
			let payload: unknown;
			p.on('queue:prepend' as any, (data: unknown) => { payload = data; });
			p.queuePrepend(track('a'));
			expect(p.queue()).toEqual([track('a'), track('b')]);
			expect(payload).toBeDefined();
		});

		it('insert places at the given index and emits queue:insert', () => {
			const p = setup();
			p.queue([track('a'), track('c')]);
			p.queueInsert(track('b'), 1);
			expect(p.queue()).toEqual([track('a'), track('b'), track('c')]);
		});

		it('append accepts an array', () => {
			const p = setup();
			p.queueAppend([track('a'), track('b')]);
			expect(p.queue()).toEqual([track('a'), track('b')]);
		});
	});

	describe('queueRemove / queueRemoveAt', () => {
		it('queueRemove(id) drops the matching item and emits queue:remove', () => {
			const p = setup();
			p.queue([track('a'), track('b')]);
			let removedId: string | undefined;
			p.on('queue:remove' as any, (data: any) => { removedId = data.id; });
			p.queueRemove('a');
			expect(p.queue()).toEqual([track('b')]);
			expect(removedId).toBe('a');
		});

		it('queueRemoveAt(idx) drops by index', () => {
			const p = setup();
			p.queue([track('a'), track('b'), track('c')]);
			p.queueRemoveAt(1);
			expect(p.queue()).toEqual([track('a'), track('c')]);
		});
	});

	describe('queueMove / queueShuffle / queueSort / queueClear', () => {
		it('queueMove repositions and emits queue:move', () => {
			const p = setup();
			p.queue([track('a'), track('b'), track('c')]);
			let moved: { from: number; to: number } | undefined;
			p.on('queue:move' as any, (data: any) => { moved = data; });
			p.queueMove(0, 2);
			expect(p.queue().map(i => i.id)).toEqual(['b', 'c', 'a']);
			expect(moved).toEqual({ from: 0, to: 2 });
		});

		it('queueShuffle keeps the same items and emits queue:shuffle', () => {
			const p = setup();
			p.queue([track('a'), track('b'), track('c'), track('d')]);
			let shuffled = false;
			p.on('queue:shuffle' as any, () => { shuffled = true; });
			p.queueShuffle();
			expect(shuffled).toBe(true);
			expect(p.queueLength()).toBe(4);
		});

		it('queueSort applies the comparator and emits queue:sort', () => {
			const p = setup();
			p.queue([track('c'), track('a'), track('b')]);
			let sorted = false;
			p.on('queue:sort' as any, () => { sorted = true; });
			p.queueSort((a, b) => String(a.id).localeCompare(String(b.id)));
			expect(p.queue().map(i => i.id)).toEqual(['a', 'b', 'c']);
			expect(sorted).toBe(true);
		});

		it('queueClear empties and emits queue:clear', () => {
			const p = setup();
			p.queue([track('a'), track('b')]);
			let cleared: { previousLength: number } | undefined;
			p.on('queue:clear' as any, (data: any) => { cleared = data; });
			p.queueClear();
			expect(p.queue()).toEqual([]);
			expect(cleared?.previousLength).toBe(2);
		});
	});

	describe('peeks + lookups', () => {
		it('peekNext returns the next item after cursor', () => {
			const p = setup();
			p.queue([track('a'), track('b')]);
			expect(p.peekNext()?.id).toBe('b');
		});

		it('peekPrevious returns undefined when at start', () => {
			const p = setup();
			p.queue([track('a'), track('b')]);
			expect(p.peekPrevious()).toBeUndefined();
		});

		it('queueIndexOf returns the index of a known id', () => {
			const p = setup();
			p.queue([track('a'), track('b')]);
			expect(p.queueIndexOf('b')).toBe(1);
		});

		it('queueIndexOf returns -1 for unknown ids', () => {
			const p = setup();
			expect(p.queueIndexOf('zzz')).toBe(-1);
		});
	});

	describe('cursor — item / index', () => {
		it('item(id) moves the cursor and emits "current"', () => {
			const p = setup();
			p.queue([track('a'), track('b')]);
			let payload: { item: MusicPlaylistItem | undefined; index: number } | undefined;
			p.on('current' as any, (data: any) => { payload = data; });
			p.item('b');
			expect(p.item()?.id).toBe('b');
			expect(p.index()).toBe(1);
			expect(payload?.index).toBe(1);
		});

		it('item() accepts a numeric index', () => {
			const p = setup();
			p.queue([track('a'), track('b'), track('c')]);
			p.item(2);
			expect(p.item()?.id).toBe('c');
		});
	});
});
