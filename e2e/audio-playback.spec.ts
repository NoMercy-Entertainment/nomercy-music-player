// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import { expect, test } from '@playwright/test';

// ── helpers ──────────────────────────────────────────────────────────────────

async function mountBasicPlayer(page: import('@playwright/test').Page): Promise<void> {
	await page.goto('/e2e/fixture-audio.html');
	await page.waitForFunction(
		() => (window as any).__playerReady !== undefined,
		{ timeout: 15_000 },
	);
	const ready = await page.evaluate(() => (window as any).__playerReady);
	const err = await page.evaluate(() => (window as any).__playerError);
	if (!ready) {
		throw new Error(`Player failed to mount: ${err}`);
	}
}

// ── tests ─────────────────────────────────────────────────────────────────────

test.describe('audio-playback (AudioElementBackend)', () => {
	test.beforeEach(async ({ page }) => {
		await mountBasicPlayer(page);
	});

	test('loadedmetadata fires and duration > 0 for trackA.mp3', async ({ page }) => {
		// Load track and wait for the duration event — proves real decode happened.
		const duration = await page.evaluate(async () => {
			const player = (window as any).playerBasic;

			return new Promise<number>((resolve, reject) => {
				const timeout = setTimeout(() => reject(new Error('duration event timeout')), 10_000);

				player.on('duration', (data: { duration: number }) => {
					clearTimeout(timeout);
					resolve(data.duration);
				});

				player.queue([{
					id: '1',
					url: '/e2e/media/trackA.mp3',
					title: 'Track A',
				}]);
				player.item('1');
				player.backend().load('/e2e/media/trackA.mp3');
			});
		});

		expect(duration).toBeGreaterThan(0);
	});

	test('currentTime advances at wall-clock rate after play()', async ({ page }) => {
		// Autoplay policy: browsers require a user gesture. Playwright's evaluate
		// runs in a trusted context so element.play() is permitted.
		const advanced = await page.evaluate(async () => {
			const player = (window as any).playerBasic;
			const backend = player.backend();

			// Load and wait for canplay before calling play().
			await new Promise<void>((resolve, reject) => {
				const timeout = setTimeout(() => reject(new Error('canplay timeout')), 10_000);
				backend.on('canplay', () => { clearTimeout(timeout); resolve(); });
				backend.load('/e2e/media/trackA.mp3');
			});

			await backend.play();

			const t0 = backend.currentTime();
			await new Promise<void>(r => setTimeout(r, 600));
			const t1 = backend.currentTime();

			return t1 - t0;
		});

		// 600 ms of wall-clock time at normal playback rate — allow wide tolerance
		// for browser scheduling jitter.
		expect(advanced).toBeGreaterThan(0.2);
		expect(advanced).toBeLessThan(1.5);
	});

	test('ended event fires when short.mp3 plays to completion', async ({ page }) => {
		// short.mp3 is 1 s — wait up to 8 s for ended.
		const didEnd = await page.evaluate(async () => {
			const player = (window as any).playerBasic;
			const backend = player.backend();

			return new Promise<boolean>((resolve, reject) => {
				const timeout = setTimeout(() => reject(new Error('ended timeout')), 8_000);

				backend.on('ended', () => {
					clearTimeout(timeout);
					resolve(true);
				});

				backend.on('canplay', () => {
					backend.play().catch(() => {});
				});

				backend.load('/e2e/media/short.mp3');
			});
		});

		expect(didEnd).toBe(true);
	});

	test('duration() returns finite positive number after metadata loads', async ({ page }) => {
		const duration = await page.evaluate(async () => {
			const backend = (window as any).playerBasic.backend();

			await new Promise<void>((resolve, reject) => {
				const timeout = setTimeout(() => reject(new Error('loadedmetadata timeout')), 10_000);
				backend.on('loadedmetadata', () => { clearTimeout(timeout); resolve(); });
				backend.load('/e2e/media/trackA.mp3');
			});

			return backend.duration();
		});

		expect(Number.isFinite(duration)).toBe(true);
		expect(duration).toBeGreaterThan(0);
	});
});
