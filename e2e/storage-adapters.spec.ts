// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * Proves the real browser storage adapters from nomercy-player-core work end-
 * to-end — jsdom fakes localStorage and IndexedDB; these tests run in a real
 * Chromium page.
 *
 *  - LocalStorageBackend: write a value, navigate to a fresh page, read it
 *    back — proves it actually hit window.localStorage.
 *  - IndexedDBBackend: write a value, navigate to a fresh page, read it back
 *    — proves the real IndexedDB pipeline (open → createObjectStore → put →
 *    get) works in Chromium.
 */

import { expect, test } from '@playwright/test';

// ── shared fixture ───────────────────────────────────────────────────────────

async function mountStoragePage(page: import('@playwright/test').Page): Promise<void> {
	await page.goto('/e2e/fixture-audio.html');
	await page.waitForFunction(() => (window as any).__playerReady !== undefined, { timeout: 15_000 });
}

// ── localStorage ─────────────────────────────────────────────────────────────

test.describe('storage-adapters — LocalStorageBackend', () => {
	test.beforeEach(async ({ page }) => {
		await mountStoragePage(page);
		// Clear any leftover keys from previous runs.
		await page.evaluate(() => {
			window.localStorage.removeItem('nm_e2e_test_key');
			window.localStorage.removeItem('nm_e2e_json_key');
		});
	});

	test('set() persists across page navigation and get() reads it back', async ({ page }) => {
		await page.evaluate(async () => {
			const { LocalStorageBackend } = await import(
				'/node_modules/@nomercy-entertainment/nomercy-player-core/dist/adapters/storage/index.js',
			);
			const storage = new LocalStorageBackend();
			storage.set('nm_e2e_test_key', 'hello-from-e2e');
		});

		// Navigate back to the same page — fresh JS context.
		await mountStoragePage(page);

		const value = await page.evaluate(async () => {
			const { LocalStorageBackend } = await import(
				'/node_modules/@nomercy-entertainment/nomercy-player-core/dist/adapters/storage/index.js',
			);
			const storage = new LocalStorageBackend();
			return storage.get('nm_e2e_test_key');
		});

		expect(value).toBe('hello-from-e2e');
	});

	test('setJSON() / getJSON() round-trips an object across navigation', async ({ page }) => {
		const payload = {
			track: 1,
			volume: 0.8,
			repeat: 'all',
		};

		await page.evaluate(async (data) => {
			const { LocalStorageBackend } = await import(
				'/node_modules/@nomercy-entertainment/nomercy-player-core/dist/adapters/storage/index.js',
			);
			const storage = new LocalStorageBackend();
			storage.setJSON('nm_e2e_json_key', data);
		}, payload);

		await mountStoragePage(page);

		const retrieved = await page.evaluate(async () => {
			const { LocalStorageBackend } = await import(
				'/node_modules/@nomercy-entertainment/nomercy-player-core/dist/adapters/storage/index.js',
			);
			const storage = new LocalStorageBackend();
			return storage.getJSON('nm_e2e_json_key');
		});

		expect(retrieved).toEqual(payload);
	});

	test('remove() deletes the key so get() returns null', async ({ page }) => {
		await page.evaluate(async () => {
			const { LocalStorageBackend } = await import(
				'/node_modules/@nomercy-entertainment/nomercy-player-core/dist/adapters/storage/index.js',
			);
			const storage = new LocalStorageBackend();
			storage.set('nm_e2e_test_key', 'to-be-removed');
			storage.remove('nm_e2e_test_key');
		});

		const value = await page.evaluate(async () => {
			const { LocalStorageBackend } = await import(
				'/node_modules/@nomercy-entertainment/nomercy-player-core/dist/adapters/storage/index.js',
			);
			const storage = new LocalStorageBackend();
			return storage.get('nm_e2e_test_key');
		});

		expect(value).toBeNull();
	});

	test('EqualizerPlugin persists band state to localStorage via persistKey', async ({ page }) => {
		// Proves the EQ persistence pipeline flows all the way through to real
		// localStorage — not just that the plugin's internal state is updated.
		//
		// The Plugin base class auto-prefixes storage keys with `nmplayer-<pluginId>-`,
		// so the actual localStorage key is `nmplayer-equalizer-<persistKey>`.
		const PERSIST_KEY = 'nm_e2e_eq_state';
		const LS_KEY = `nmplayer-equalizer-${PERSIST_KEY}`;

		// Cleanup any leftover state first.
		await page.evaluate(key => window.localStorage.removeItem(key), LS_KEY);

		// Write via the EQ plugin.
		await page.evaluate(async ({ persistKey }) => {
			const EqualizerPlugin = (window as any).EqualizerPlugin;
			const player = (window as any).playerWA;

			// Re-add with a persistKey so it auto-saves.
			player.removePlugin(EqualizerPlugin);
			player.addPlugin(EqualizerPlugin, {
				persistKey,
				autoSave: true,
			});

			const eq = player.getPlugin(EqualizerPlugin);
			eq.band({
				frequency: 1000,
				gain: 7,
			});

			// Trigger explicit save so state hits localStorage synchronously.
			eq.save();

			// Flush any remaining microtasks.
			await Promise.resolve();
		}, { persistKey: PERSIST_KEY });

		// Verify the prefixed localStorage key contains the band value.
		const rawValue = await page.evaluate(key => window.localStorage.getItem(key), LS_KEY);
		expect(rawValue).not.toBeNull();

		const parsed = JSON.parse(rawValue!);
		const band1k = (parsed.bands as Array<{ frequency: number | string; gain: number }>)
			?.find(b => b.frequency === 1000);
		expect(band1k?.gain).toBe(7);

		// Cleanup.
		await page.evaluate(key => window.localStorage.removeItem(key), LS_KEY);
	});
});

// ── IndexedDB ─────────────────────────────────────────────────────────────────

test.describe('storage-adapters — IndexedDBBackend', () => {
	const DB_NAME = 'nm_e2e_idb_test';
	const STORE_NAME = 'kv';

	test.beforeEach(async ({ page }) => {
		await mountStoragePage(page);
		// Delete the test database so each test starts clean.
		await page.evaluate(({ dbName }) => {
			return new Promise<void>((resolve) => {
				const req = indexedDB.deleteDatabase(dbName);
				req.onsuccess = () => resolve();
				req.onerror = () => resolve();
				req.onblocked = () => resolve();
			});
		}, { dbName: DB_NAME });
	});

	test('setJSON() / getJSON() round-trips an object across page navigation', async ({ page }) => {
		const payload = {
			albumId: 42,
			lastPosition: 1.23,
		};

		await page.evaluate(async ({ db, store, data }) => {
			const { IndexedDBBackend } = await import(
				'/node_modules/@nomercy-entertainment/nomercy-player-core/dist/adapters/storage/index.js',
			);
			const storage = new IndexedDBBackend({
				dbName: db,
				storeName: store,
			});
			await storage.setJSON('nm_idb_payload', data);
		}, {
			db: DB_NAME,
			store: STORE_NAME,
			data: payload,
		});

		// Navigate to a fresh page to prove persistence (not just in-memory).
		await mountStoragePage(page);

		const retrieved = await page.evaluate(async ({ db, store }) => {
			const { IndexedDBBackend } = await import(
				'/node_modules/@nomercy-entertainment/nomercy-player-core/dist/adapters/storage/index.js',
			);
			const storage = new IndexedDBBackend({
				dbName: db,
				storeName: store,
			});
			return storage.getJSON('nm_idb_payload');
		}, {
			db: DB_NAME,
			store: STORE_NAME,
		});

		expect(retrieved).toEqual(payload);
	});

	test('remove() deletes the key so get() returns null', async ({ page }) => {
		await page.evaluate(async ({ db, store }) => {
			const { IndexedDBBackend } = await import(
				'/node_modules/@nomercy-entertainment/nomercy-player-core/dist/adapters/storage/index.js',
			);
			const storage = new IndexedDBBackend({
				dbName: db,
				storeName: store,
			});
			await storage.set('tmp_key', 'to-be-removed');
			await storage.remove('tmp_key');
		}, {
			db: DB_NAME,
			store: STORE_NAME,
		});

		const value = await page.evaluate(async ({ db, store }) => {
			const { IndexedDBBackend } = await import(
				'/node_modules/@nomercy-entertainment/nomercy-player-core/dist/adapters/storage/index.js',
			);
			const storage = new IndexedDBBackend({
				dbName: db,
				storeName: store,
			});
			return storage.get('tmp_key');
		}, {
			db: DB_NAME,
			store: STORE_NAME,
		});

		expect(value).toBeNull();
	});
});
