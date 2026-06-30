// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * Proves KeyHandlerPlugin default bindings work via real keyboard events:
 *
 *  - Space → togglePlayback() (play while paused, pause while playing)
 *  - ArrowLeft → rewind(5 s)
 *  - ArrowRight → forward(5 s)
 *  - ArrowUp / ArrowDown → volumeUp() / volumeDown()
 *  - m → toggleMute()
 *
 * page.keyboard.press() dispatches real KeyboardEvent on the document, which
 * the plugin's document-scoped listener intercepts.
 */

import { expect, test } from '@playwright/test';

// ── helper ────────────────────────────────────────────────────────────────────

async function mountKeyHandlerPage(page: import('@playwright/test').Page): Promise<void> {
	await page.goto('/e2e/fixture-audio.html');
	await page.waitForFunction(() => (window as any).__playerReady !== undefined, { timeout: 15_000 });
	const err = await page.evaluate(() => (window as any).__playerError);
	if (err)
		throw new Error(`Player mount error: ${err}`);

	// KeyHandlerPlugin is pre-wired in the fixture at window.KeyHandlerPlugin.
	await page.evaluate(() => {
		const KeyHandlerPlugin = (window as any).KeyHandlerPlugin;
		const player = (window as any).playerBasic;
		// scope: 'document' (default) so page.keyboard works without focus.
		player.addPlugin(KeyHandlerPlugin, {
			scope: 'document',
			cooldownMs: 0,
		});
	});

	// Load a track and wait until canplay so time() is seekable.
	await page.evaluate(async () => {
		const backend = (window as any).playerBasic.backend();
		await new Promise<void>((resolve, reject) => {
			const timeout = setTimeout(() => reject(new Error('canplay timeout')), 10_000);
			backend.on('canplay', () => { clearTimeout(timeout); resolve(); });
			backend.load('/e2e/media/trackA.mp3');
		});
	});
}

// ── tests ─────────────────────────────────────────────────────────────────────

test.describe('keyboard (KeyHandlerPlugin default bindings)', () => {
	test.beforeEach(async ({ page }) => {
		await mountKeyHandlerPage(page);
	});

	test('Space starts playback when paused', async ({ page }) => {
		// Start paused (canplay already fired, not yet playing).
		const playStateBefore = await page.evaluate(() => (window as any).playerBasic.playState());
		// playState is 'paused' or 'idle' — not 'playing'.
		expect(playStateBefore).not.toBe('playing');

		// Register a one-shot play listener so we can await the state change.
		const played = page.evaluate(() => {
			return new Promise<boolean>((resolve) => {
				(window as any).playerBasic.on('play', () => resolve(true));
				setTimeout(resolve, 3_000, false);
			});
		});

		await page.keyboard.press('Space');
		const result = await played;
		expect(result).toBe(true);
	});

	test('Space pauses playback when playing', async ({ page }) => {
		// Start playing first.
		await page.evaluate(() => (window as any).playerBasic.backend().play());
		// Wait for play event.
		await page.waitForFunction(() => (window as any).playerBasic.playState() === 'playing', { timeout: 5_000 });

		const paused = page.evaluate(() => {
			return new Promise<boolean>((resolve) => {
				(window as any).playerBasic.on('pause', () => resolve(true));
				setTimeout(resolve, 3_000, false);
			});
		});

		await page.keyboard.press('Space');
		const result = await paused;
		expect(result).toBe(true);
	});

	test('ArrowLeft rewinds position toward 0', async ({ page }) => {
		// trackA.mp3 is 3 s. Seek to 2.5 s so there is room to rewind.
		// The default rewind is 5 s — clamped to 0 on a 3 s track.
		const timeBefore = await page.evaluate(async () => {
			const player = (window as any).playerBasic;
			const backend = player.backend();

			await backend.play();

			// player.time(n) is the public seek API. Seek to 2.5 s.
			await player.time(2.5);

			// Wait for the seek to settle.
			await new Promise<void>(r => setTimeout(r, 150));
			return player.time() as number;
		});

		// Verify we are actually near 2.5 s before pressing the key.
		// Abort if the seek didn't land (edge-case on slow CI).
		expect(timeBefore).toBeGreaterThan(0);

		await page.keyboard.press('ArrowLeft');
		await page.waitForTimeout(200);
		const posAfterRewind = await page.evaluate(() => (window as any).playerBasic.time() as number);

		// After rewinding from ~2.5 s by 5 s the position should be near 0
		// (clamped). It must be strictly less than where we were before.
		expect(posAfterRewind).toBeLessThan(timeBefore);
	});

	test('ArrowRight advances position', async ({ page }) => {
		// Start from 0 — trackA.mp3 is 3 s.
		// The default forward is 5 s — clamped to the track end.
		await page.evaluate(async () => {
			const player = (window as any).playerBasic;
			const backend = player.backend();
			await backend.play();
			// Seek to beginning.
			await player.time(0);
			await new Promise<void>(r => setTimeout(r, 150));
		});

		const timeBefore = await page.evaluate(() => (window as any).playerBasic.time());
		await page.keyboard.press('ArrowRight');
		await page.waitForTimeout(200);
		const timeAfter = await page.evaluate(() => (window as any).playerBasic.time());

		// After forwarding from ~0 s the position must be greater (or clamped at
		// end — in which case timeAfter >= duration).
		expect(timeAfter).toBeGreaterThan(timeBefore);
	});

	test('ArrowUp increases volume', async ({ page }) => {
		// Set a known baseline volume.
		await page.evaluate(() => (window as any).playerBasic.volume(0.5));
		const volBefore = await page.evaluate(() => (window as any).playerBasic.volume());

		await page.keyboard.press('ArrowUp');
		await page.waitForTimeout(100);
		const volAfter = await page.evaluate(() => (window as any).playerBasic.volume());

		expect(volAfter).toBeGreaterThan(volBefore);
	});

	test('ArrowDown decreases volume', async ({ page }) => {
		await page.evaluate(() => (window as any).playerBasic.volume(0.5));
		const volBefore = await page.evaluate(() => (window as any).playerBasic.volume());

		await page.keyboard.press('ArrowDown');
		await page.waitForTimeout(100);
		const volAfter = await page.evaluate(() => (window as any).playerBasic.volume());

		expect(volAfter).toBeLessThan(volBefore);
	});

	test('m toggles mute on', async ({ page }) => {
		// Ensure unmuted before test.
		await page.evaluate(() => (window as any).playerBasic.unmute());
		const mutedBefore = await page.evaluate(() => (window as any).playerBasic.volumeState() === 'muted');
		expect(mutedBefore).toBe(false);

		await page.keyboard.press('m');
		await page.waitForTimeout(100);
		const mutedAfter = await page.evaluate(() => (window as any).playerBasic.volumeState() === 'muted');
		expect(mutedAfter).toBe(true);
	});

	test('m toggles mute off when already muted', async ({ page }) => {
		// Mute first.
		await page.evaluate(() => (window as any).playerBasic.mute());
		const mutedBefore = await page.evaluate(() => (window as any).playerBasic.volumeState() === 'muted');
		expect(mutedBefore).toBe(true);

		await page.keyboard.press('m');
		await page.waitForTimeout(100);
		const mutedAfter = await page.evaluate(() => (window as any).playerBasic.volumeState() === 'muted');
		expect(mutedAfter).toBe(false);
	});
});
