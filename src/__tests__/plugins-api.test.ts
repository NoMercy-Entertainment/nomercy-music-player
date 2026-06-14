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
			const p = setup();
			expect(p.addPlugin(HelloPlugin)).toBe(p);
		});

		it('instantiates the plugin and calls use()', async () => {
			const p = setup();
			p.addPlugin(HelloPlugin);
			await p.ready();
			const instance = p.getPlugin(HelloPlugin);
			expect(instance).toBeInstanceOf(HelloPlugin);
			expect(instance?.used).toBe(true);
		});

		it('emits "plugin:installed" with id + version', async () => {
			const p = setup();
			let payload: { id: string; version: string } | undefined;
			p.on('plugin:installed' as any, (data: any) => { payload = data; });
			p.addPlugin(HelloPlugin);
			await p.ready();
			expect(payload).toEqual({ id: 'hello', version: '1.2.3' });
		});

		it('merges static translations into the player table', async () => {
			const p = setup();
			p.addPlugin(HelloPlugin);
			await p.ready();
			expect(p.t('plugin.hello.greet')).toBe('hi');
		});

		it('throws core:plugin/duplicate-id on second add of same id', () => {
			const p = setup();
			p.addPlugin(HelloPlugin);
			expect(() => p.addPlugin(HelloPlugin)).toThrow(/core:plugin\/duplicate-id/);
		});

		it('throws core:plugin/missing-dep when a required plugin is absent', () => {
			const p = setup();
			expect(() => p.addPlugin(NeedsHelloPlugin)).toThrow(/core:plugin\/missing-dep/);
		});

		it('succeeds when required plugin is registered first', () => {
			const p = setup();
			p.addPlugin(HelloPlugin);
			expect(() => p.addPlugin(NeedsHelloPlugin)).not.toThrow();
		});
	});

	describe('getPlugin / getPluginById', () => {
		it('getPlugin returns undefined when not registered', () => {
			expect(setup().getPlugin(HelloPlugin)).toBeUndefined();
		});

		it('getPluginById finds the same instance', () => {
			const p = setup();
			p.addPlugin(HelloPlugin);
			const byClass = p.getPlugin(HelloPlugin);
			const byId = p.getPluginById('hello');
			expect(byClass).toBe(byId);
		});
	});

	describe('plugins() / enabledPlugins()', () => {
		it('lists every registered plugin', async () => {
			const p = setup();
			p.addPlugin(HelloPlugin);
			p.addPlugin(WorldPlugin);
			await p.ready();
			expect(p.plugins().length).toBe(2);
		});

		it('enabledPlugins() excludes disabled ones', async () => {
			const p = setup();
			p.addPlugin(HelloPlugin);
			p.addPlugin(WorldPlugin);
			await p.ready();
			const hello = p.getPlugin(HelloPlugin);
			hello?.disable();
			expect(p.enabledPlugins().length).toBe(1);
			expect(p.plugins().length).toBe(2);
		});
	});

	describe('removePlugin / removePluginById', () => {
		it('disposes the plugin and emits "plugin:disposed"', async () => {
			const p = setup();
			p.addPlugin(HelloPlugin);
			await p.ready();
			const instance = p.getPlugin(HelloPlugin);
			let disposedId: string | undefined;
			p.on('plugin:disposed' as any, (data: any) => { disposedId = data.id; });
			p.removePlugin(HelloPlugin);
			expect(instance?.disposed).toBe(true);
			expect(disposedId).toBe('hello');
			expect(p.getPlugin(HelloPlugin)).toBeUndefined();
		});

		it('removePluginById works the same way', async () => {
			const p = setup();
			p.addPlugin(HelloPlugin);
			await p.ready();
			p.removePluginById('hello');
			expect(p.getPluginById('hello')).toBeUndefined();
		});

		it('removes plugin translations on dispose', () => {
			const p = setup();
			p.addPlugin(HelloPlugin);
			p.removePlugin(HelloPlugin);
			expect(p.t('plugin.hello.greet')).toBe('plugin.hello.greet');
		});
	});
});
