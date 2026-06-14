// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
	await page.goto('/e2e/fixture.html');
	await page.waitForFunction(
		() => (window as any).__playerReady !== undefined,
		{ timeout: 10_000 },
	);
});

test('player initialises without error', async ({ page }) => {
	const ready = await page.evaluate(() => (window as any).__playerReady);
	const err = await page.evaluate(() => (window as any).__playerError);
	expect(err).toBeNull();
	expect(ready).toBe(true);
});

test('player instance is available on window', async ({ page }) => {
	const hasPlayer = await page.evaluate(() => typeof (window as any).player === 'object' && (window as any).player !== null);
	expect(hasPlayer).toBe(true);
});

test('volume() returns a number', async ({ page }) => {
	const vol = await page.evaluate(() => (window as any).player.volume());
	expect(typeof vol).toBe('number');
});

test('queue() returns an array', async ({ page }) => {
	const items = await page.evaluate(() => (window as any).player.queue());
	expect(Array.isArray(items)).toBe(true);
});

test('play() is a function', async ({ page }) => {
	const isFunc = await page.evaluate(() => typeof (window as any).player.play === 'function');
	expect(isFunc).toBe(true);
});

test('pause() is a function', async ({ page }) => {
	const isFunc = await page.evaluate(() => typeof (window as any).player.pause === 'function');
	expect(isFunc).toBe(true);
});
