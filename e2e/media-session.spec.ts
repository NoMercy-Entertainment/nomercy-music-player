// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * Proves that MediaSessionPlugin pushes real metadata to navigator.mediaSession
 * in a real Chromium page. JSDOM does not implement MediaSession, so this is a
 * genuine browser-only assertion.
 *
 * The spec covers:
 *  - navigator.mediaSession.metadata.title reflects the current track's title.
 *  - playbackState transitions to 'playing' on play().
 *  - playbackState transitions to 'paused' on pause().
 */

import { expect, test } from '@playwright/test';

// MediaSessionPlugin is only importable via the subpath export from the dist.
// The fixture loads it dynamically so Vite's dev server resolves the package.

async function mountMediaSessionPage(page: import('@playwright/test').Page): Promise<void> {
	await page.goto('/e2e/fixture-audio.html');
	await page.waitForFunction(() => (window as any).__playerReady !== undefined, { timeout: 15_000 });
	const err = await page.evaluate(() => (window as any).__playerError);
	if (err)
		throw new Error(`Player mount error: ${err}`);

	// MediaSessionPlugin is pre-wired in the fixture at window.MediaSessionPlugin.
	// Add it to the basic player here so each test starts with a fresh instance.
	await page.evaluate(() => {
		const MediaSessionPlugin = (window as any).MediaSessionPlugin;
		const player = (window as any).playerBasic;
		player.addPlugin(MediaSessionPlugin);
	});
}

test.describe('media-session (MediaSessionPlugin)', () => {
	test.beforeEach(async ({ page }) => {
		await mountMediaSessionPage(page);
	});

	test('navigator.mediaSession.metadata.title matches current track title', async ({ page }) => {
		const title = await page.evaluate(async () => {
			if (!('mediaSession' in navigator))
				return '__unsupported__';

			const player = (window as any).playerBasic;

			// Queue a track and set it as current.
			player.queue([
				{
					id: 'session-test-1',
					url: '/e2e/media/trackA.mp3',
					title: 'E2E Title Track',
					artist: 'E2E Artist',
					album: 'E2E Album',
				},
			]);

			// item() setter triggers the 'item' event which MediaSessionPlugin
			// listens to and pushes metadata from.
			player.item('session-test-1');

			// _pushMetadata is async (resolveUrl). Wait a short tick.
			await new Promise<void>(r => setTimeout(r, 200));

			return navigator.mediaSession.metadata?.title ?? null;
		});

		// If the browser doesn't support MediaSession in headless, skip gracefully.
		if (title === '__unsupported__') {
			test.skip(true, 'navigator.mediaSession not available in this headless environment');
			return;
		}

		expect(title).toBe('E2E Title Track');
	});

	test('playbackState is "playing" after play()', async ({ page }) => {
		const state = await page.evaluate(async () => {
			if (!('mediaSession' in navigator))
				return '__unsupported__';

			const player = (window as any).playerBasic;
			const backend = player.backend();

			player.queue([{
				id: 'ms-play',
				url: '/e2e/media/short.mp3',
				title: 'Short',
			}]);
			player.item('ms-play');

			await new Promise<void>((resolve, reject) => {
				const timeout = setTimeout(() => reject(new Error('canplay timeout')), 10_000);
				backend.on('canplay', () => { clearTimeout(timeout); resolve(); });
				backend.load('/e2e/media/short.mp3');
			});

			await backend.play();
			// Give the 'play' event listener in MediaSessionPlugin a tick.
			await new Promise<void>(r => setTimeout(r, 50));

			return navigator.mediaSession.playbackState;
		});

		if (state === '__unsupported__') {
			test.skip(true, 'navigator.mediaSession not available in this headless environment');
			return;
		}

		expect(state).toBe('playing');
	});

	test('playbackState is "paused" after pause()', async ({ page }) => {
		const state = await page.evaluate(async () => {
			if (!('mediaSession' in navigator))
				return '__unsupported__';

			const player = (window as any).playerBasic;
			const backend = player.backend();

			player.queue([{
				id: 'ms-pause',
				url: '/e2e/media/trackA.mp3',
				title: 'A',
			}]);
			player.item('ms-pause');

			await new Promise<void>((resolve, reject) => {
				const timeout = setTimeout(() => reject(new Error('canplay timeout')), 10_000);
				backend.on('canplay', () => { clearTimeout(timeout); resolve(); });
				backend.load('/e2e/media/trackA.mp3');
			});

			await backend.play();
			await backend.pause();
			await new Promise<void>(r => setTimeout(r, 50));

			return navigator.mediaSession.playbackState;
		});

		if (state === '__unsupported__') {
			test.skip(true, 'navigator.mediaSession not available in this headless environment');
			return;
		}

		expect(state).toBe('paused');
	});
});
