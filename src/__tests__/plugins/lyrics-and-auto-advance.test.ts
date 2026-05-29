/**
 * Tests for `lyricsPlugin` and `autoAdvancePlugin`. Locks the registration
 * contract (use() runs without throwing) and the auto-advance master-toggle
 * behaviour. Lyrics fetching itself is exercised via the kit's cue helpers
 * and does not require a real network round-trip — when no `lyricsUrl` is
 * present the plugin is a no-op.
 */

import type { MusicPlaylistItem } from '../../types';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NMMusicPlayer } from '../../index';
import { autoAdvancePlugin, AutoAdvancePlugin } from '../../plugins/auto-advance';
import { lyricsPlugin, LyricsPlugin } from '../../plugins/lyrics';

function track(id: string, extra?: Partial<MusicPlaylistItem>): MusicPlaylistItem {
	return {
		id,
		name: `track ${id}`,
		...extra,
	};
}

describe('NMMusicPlayer — lyrics + auto-advance plugins', () => {
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

	describe('lyricsPlugin', () => {
		it('registers and use() does not throw on a track without lyricsUrl', async () => {
			const p = setup();
			expect(() => p.addPlugin(lyricsPlugin)).not.toThrow();
			await p.ready();
			const instance = p.getPlugin(LyricsPlugin);
			expect(instance).toBeInstanceOf(LyricsPlugin);
			// Switching cursor to a track without `lyricsUrl` must be a silent no-op.
			p.queue([track('a')]);
			expect(instance?.current()).toBeUndefined();
			expect(instance?.all().length).toBe(0);
		});
	});

	describe('autoAdvancePlugin', () => {
		it('registers and on `ended` advances to the next track', async () => {
			const p = setup();
			p.addPlugin(autoAdvancePlugin);
			await p.ready();
			p.queue([track('a'), track('b')]);
			expect(p.current()?.id).toBe('a');

			let nextFired = false;
			p.on('next' as any, () => { nextFired = true; });

			p.emit('ended' as any, undefined as any);
			// `next()` runs through the dispatch pipeline asynchronously
			await new Promise<void>(resolve => setTimeout(resolve, 0));

			expect(nextFired).toBe(true);
		});

		it('options({ enabled: false }) prevents auto-advance', async () => {
			const p = setup();
			p.addPlugin(autoAdvancePlugin);
			await p.ready();
			p.queue([track('a'), track('b')]);

			const instance = p.getPlugin(AutoAdvancePlugin);
			expect(instance).toBeInstanceOf(AutoAdvancePlugin);
			instance!.options({ enabled: false });

			let nextFired = false;
			p.on('next' as any, () => { nextFired = true; });

			p.emit('ended' as any, undefined as any);
			await new Promise<void>(resolve => setTimeout(resolve, 0));

			expect(nextFired).toBe(false);
		});

		it('advance() calls player.next() regardless of `enabled`', async () => {
			const p = setup();
			p.addPlugin(autoAdvancePlugin);
			await p.ready();
			p.queue([track('a', { url: 'blob:a' }), track('b', { url: 'blob:b' })]);

			const instance = p.getPlugin(AutoAdvancePlugin);
			instance!.options({ enabled: false });

			let nextFired = false;
			p.on('next' as any, () => { nextFired = true; });

			// advance() dispatches `next` before awaiting backend.load().
			// Don't await the full Promise — backend load hangs in happy-dom (no
			// media decoder). Yield one macrotask to flush the _dispatchBefore
			// microtask chain so the `next` event fires, then assert.
			void instance!.advance();
			await new Promise<void>(resolve => setTimeout(resolve, 0));

			expect(nextFired).toBe(true);
		});
	});
});
