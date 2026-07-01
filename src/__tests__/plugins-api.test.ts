// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * Plugin-registration API tests for NMMusicPlayer. Validates the addPlugin /
 * getPlugin / removePlugin lifecycle and the lifecycle-event re-emit contract.
 *
 * Plugin classes are recognized by `static readonly id` and instantiated /
 * initialized / `use()`-ed by the player. Translations declared on
 * `static readonly translations` are merged into the player's i18n table on
 * register and removed on dispose.
 */

import { Plugin } from '@nomercy-entertainment/nomercy-player-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NMMusicPlayer } from '../index';

class HelloPlugin extends Plugin {
	static override readonly id = 'hello';
	static override readonly version = '1.2.3';
	static override readonly translations = { en: { 'plugin.hello.greet': 'hi' } };

	used = false;
	disposed = false;

	override use(): void {
		this.used = true;
	}

	override dispose(): void {
		this.disposed = true;
	}
}

class WorldPlugin extends Plugin {
	static override readonly id = 'world';
}

class NeedsHelloPlugin extends Plugin {
	static override readonly id = 'needs-hello';
	static override readonly requires = [HelloPlugin];
}

describe('NMMusicPlayer — plugin registration', () => {
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

	describe('addPlugin', () => {
		it('returns the player for chaining', () => {
			const musicPlayer = setup();
			expect(musicPlayer.addPlugin(HelloPlugin)).toBe(musicPlayer);
		});

		it('instantiates the plugin and calls use()', async () => {
			const musicPlayer = setup();
			musicPlayer.addPlugin(HelloPlugin);
			await musicPlayer.ready();
			const instance = musicPlayer.getPlugin(HelloPlugin);
			expect(instance).toBeInstanceOf(HelloPlugin);
			expect(instance?.used).toBe(true);
		});

		it('emits "plugin:installed" with id + version', async () => {
			const musicPlayer = setup();
			let payload: { id: string; version: string } | undefined;
			musicPlayer.on('plugin:installed' as any, (data: any) => { payload = data; });
			musicPlayer.addPlugin(HelloPlugin);
			await musicPlayer.ready();
			expect(payload).toEqual({ id: 'hello', version: '1.2.3' });
		});

		it('merges static translations into the player table', async () => {
			const musicPlayer = setup();
			musicPlayer.addPlugin(HelloPlugin);
			await musicPlayer.ready();
			expect(musicPlayer.t('plugin.hello.greet')).toBe('hi');
		});

		it('throws core:plugin/duplicate-id on second add of same id', () => {
			const musicPlayer = setup();
			musicPlayer.addPlugin(HelloPlugin);
			expect(() => musicPlayer.addPlugin(HelloPlugin)).toThrow(/core:plugin\/duplicate-id/);
		});

		it('throws core:plugin/missing-dep when a required plugin is absent', () => {
			const musicPlayer = setup();
			expect(() => musicPlayer.addPlugin(NeedsHelloPlugin)).toThrow(/core:plugin\/missing-dep/);
		});

		it('succeeds when required plugin is registered first', () => {
			const musicPlayer = setup();
			musicPlayer.addPlugin(HelloPlugin);
			expect(() => musicPlayer.addPlugin(NeedsHelloPlugin)).not.toThrow();
		});
	});

	describe('getPlugin / getPluginById', () => {
		it('getPlugin returns undefined when not registered', () => {
			expect(setup().getPlugin(HelloPlugin)).toBeUndefined();
		});

		it('getPluginById finds the same instance', () => {
			const musicPlayer = setup();
			musicPlayer.addPlugin(HelloPlugin);
			const byClass = musicPlayer.getPlugin(HelloPlugin);
			const byId = musicPlayer.getPluginById('hello');
			expect(byClass).toBe(byId);
		});
	});

	describe('plugins() / enabledPlugins()', () => {
		it('lists every registered plugin', async () => {
			const musicPlayer = setup();
			musicPlayer.addPlugin(HelloPlugin);
			musicPlayer.addPlugin(WorldPlugin);
			await musicPlayer.ready();
			expect(musicPlayer.plugins().length).toBe(2);
		});

		it('enabledPlugins() excludes disabled ones', async () => {
			const musicPlayer = setup();
			musicPlayer.addPlugin(HelloPlugin);
			musicPlayer.addPlugin(WorldPlugin);
			await musicPlayer.ready();
			const hello = musicPlayer.getPlugin(HelloPlugin);
			hello?.disable();
			expect(musicPlayer.enabledPlugins().length).toBe(1);
			expect(musicPlayer.plugins().length).toBe(2);
		});
	});

	describe('removePlugin / removePluginById', () => {
		it('disposes the plugin and emits "plugin:disposed"', async () => {
			const musicPlayer = setup();
			musicPlayer.addPlugin(HelloPlugin);
			await musicPlayer.ready();
			const instance = musicPlayer.getPlugin(HelloPlugin);
			let disposedId: string | undefined;
			musicPlayer.on('plugin:disposed' as any, (data: any) => { disposedId = data.id; });
			musicPlayer.removePlugin(HelloPlugin);
			expect(instance?.disposed).toBe(true);
			expect(disposedId).toBe('hello');
			expect(musicPlayer.getPlugin(HelloPlugin)).toBeUndefined();
		});

		it('removePluginById works the same way', async () => {
			const musicPlayer = setup();
			musicPlayer.addPlugin(HelloPlugin);
			await musicPlayer.ready();
			musicPlayer.removePluginById('hello');
			expect(musicPlayer.getPluginById('hello')).toBeUndefined();
		});

		it('removes plugin translations on dispose', () => {
			const musicPlayer = setup();
			musicPlayer.addPlugin(HelloPlugin);
			musicPlayer.removePlugin(HelloPlugin);
			expect(musicPlayer.t('plugin.hello.greet')).toBe('plugin.hello.greet');
		});
	});
});
