/**
 * Real-behavior lifecycle tests for NMMusicPlayer. Drives `setup()`, `ready()`,
 * phase transitions, dispose. No throw-tolerance — methods are implemented now.
 */

import { PlayerError, StateError } from '@nomercy-entertainment/nomercy-player-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { nmMPlayer, NMMusicPlayer } from '../index';

describe('NMMusicPlayer — lifecycle', () => {
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

	describe('construction', () => {
		it('creates a player instance bound to the matching div', () => {
			const player = new NMMusicPlayer('test');
			expect(player).toBeDefined();
			expect(player.id).toBe('test');
			expect(player.container.id).toBe('test');
		});

		it('factory function returns a player', () => {
			const player = nmMPlayer('test');
			expect(player).toBeInstanceOf(NMMusicPlayer);
		});
	});

	describe('phase()', () => {
		it('returns "idle" before setup() is called', () => {
			const player = new NMMusicPlayer('test');
			expect(player.phase()).toBe('idle');
		});

		it('returns "ready" after setup() pipeline finishes', async () => {
			const player = new NMMusicPlayer('test');
			player.setup({});
			await player.ready();
			expect(player.phase()).toBe('ready');
		});

		it('returns "disposed" after dispose()', () => {
			const player = new NMMusicPlayer('test');
			player.dispose();
			expect(player.phase()).toBe('disposed');
		});
	});

	describe('setup()', () => {
		it('returns the player instance for chaining', () => {
			const player = new NMMusicPlayer('test');
			expect(player.setup({})).toBe(player);
		});

		it('transitions phase: idle → setup → ready', async () => {
			const player = new NMMusicPlayer('test');
			const transitions: string[] = [player.phase()];
			player.on('phase', ({ to }) => transitions.push(to));
			player.setup({});
			await player.ready();
			expect(transitions).toEqual(['idle', 'setup', 'ready']);
		});

		it('emits the lifecycle event chain in order', async () => {
			const player = new NMMusicPlayer('test');
			const events: string[] = [];
			const sequence = [
				'beforeSetup',
				'setupStart',
				'configResolved',
				'pluginsRegistering',
				'pluginsRegistered',
				'streamsReady',
				'authReady',
				'playlistReady',
				'mediaReady',
				'ready',
			] as const;
			for (const name of sequence) {
				player.on(name as any, () => events.push(name));
			}
			player.setup({});
			await player.ready();
			expect(events).toEqual([...sequence]);
		});

		it('throws when setup() is called twice (spec §14: dispose first)', async () => {
			const player = new NMMusicPlayer('test');
			player.setup({});
			await player.ready();
			expect(() => player.setup({})).toThrow(/already-setup/);
		});
	});

	describe('ready()', () => {
		it('returns a Promise', () => {
			const player = new NMMusicPlayer('test');
			expect(player.ready()).toBeInstanceOf(Promise);
		});

		it('resolves when setup completes', async () => {
			const player = new NMMusicPlayer('test');
			player.setup({});
			await expect(player.ready()).resolves.toBeUndefined();
		});

		it('resolves immediately when called after ready', async () => {
			const player = new NMMusicPlayer('test');
			player.setup({});
			await expect(player.ready()).resolves.toBeUndefined();
		});

		it('rejects with a spec-compliant StateError when dispose runs first', async () => {
			const player = new NMMusicPlayer('test');
			const promise = player.ready();
			player.dispose();
			let err: unknown;
			try { await promise; }
			catch (e) { err = e; }
			expect(err).toBeInstanceOf(PlayerError);
			expect(err).toBeInstanceOf(StateError);
			expect((err as PlayerError).code).toBe('core:player/disposed');
			expect((err as PlayerError).severity).toBe('error');
			expect((err as PlayerError).scope).toEqual({ kind: 'core' });
		});
	});

	describe('dispose()', () => {
		it('transitions phase: any → disposing → disposed', () => {
			const player = new NMMusicPlayer('test');
			const transitions: string[] = [];
			player.on('phase', ({ to }) => transitions.push(to));
			player.dispose();
			expect(transitions).toEqual(['disposing', 'disposed']);
		});

		it('emits "dispose" event', () => {
			const player = new NMMusicPlayer('test');
			let disposed = false;
			player.on('dispose', () => { disposed = true; });
			player.dispose();
			expect(disposed).toBe(true);
		});

		it('is idempotent — second dispose is a no-op', () => {
			const player = new NMMusicPlayer('test');
			player.dispose();
			expect(() => player.dispose()).not.toThrow();
		});
	});

	describe('setupState()', () => {
		it('returns NOT_SETUP before setup()', () => {
			const player = new NMMusicPlayer('test');
			expect(player.setupState()).toBe('not-setup');
		});

		it('returns READY after setup() pipeline finishes', async () => {
			const player = new NMMusicPlayer('test');
			player.setup({});
			await player.ready();
			expect(player.setupState()).toBe('ready');
		});

		it('returns DISPOSED after dispose()', () => {
			const player = new NMMusicPlayer('test');
			player.dispose();
			expect(player.setupState()).toBe('disposed');
		});
	});

	describe('dispatching()', () => {
		it('returns empty array initially', () => {
			expect(new NMMusicPlayer('test').dispatching()).toEqual([]);
		});
	});

	describe('backend("webaudio") behavioural contract', () => {
		it('throws BrowserPolicyError when AudioContext is unavailable (happy-dom environment)', async () => {
			// happy-dom does not implement Web Audio — WebAudioBackend must fail-fast
			// with a structured BrowserPolicyError rather than a generic error.
			expect(typeof (globalThis as any).AudioContext).toBe('undefined');

			const { BrowserPolicyError } = await import('@nomercy-entertainment/nomercy-player-core');
			const player = new NMMusicPlayer('test').setup({});
			await player.ready();
			let err: unknown;
			try { await player.backend('webaudio'); }
			catch (e) { err = e; }
			expect(err).toBeInstanceOf(PlayerError);
			expect(err).toBeInstanceOf(BrowserPolicyError);
			expect((err as PlayerError).code).toBe('core:policy/audioContextUnsupported');
			expect((err as PlayerError).severity).toBe('error');
			expect((err as PlayerError).scope).toEqual({ kind: 'backend', id: 'webaudio' });
		});
	});
});
