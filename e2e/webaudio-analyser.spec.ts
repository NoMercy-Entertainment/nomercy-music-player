// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * Proves that the real Web Audio graph processes real audio:
 *  - AudioContext.sampleRate > 0 after plugin wires up
 *  - AudioContext.state transitions to 'running' on play()
 *  - AnalyserNode returns NON-ZERO frequency data (real audio flows)
 *  - Frequency peak is near the 440 Hz bin of the 440 Hz tone (trackA.mp3)
 *
 * These assertions are impossible in jsdom — they require a real AudioContext
 * decoding a real audio stream.
 */

import { expect, test } from '@playwright/test';

// ── helpers ──────────────────────────────────────────────────────────────────

async function mountAudioPage(page: import('@playwright/test').Page): Promise<void> {
	await page.goto('/e2e/fixture-audio.html');
	await page.waitForFunction(
		() => (window as any).__playerReady !== undefined,
		{ timeout: 15_000 },
	);
	const err = await page.evaluate(() => (window as any).__playerError);
	if (err)
		throw new Error(`Player mount error: ${err}`);

	const waReady = await page.evaluate(() => (window as any).__waReady);
	const waErr = await page.evaluate(() => (window as any).__waError);
	if (!waReady) {
		throw new Error(`WebAudio player unavailable: ${waErr}`);
	}
}

// ── tests ─────────────────────────────────────────────────────────────────────

test.describe('webaudio-analyser (WebAudioBackend + AudioGraphPlugin)', () => {
	test.beforeEach(async ({ page }) => {
		await mountAudioPage(page);
	});

	test('AudioContext.sampleRate > 0 after plugin init', async ({ page }) => {
		const sampleRate = await page.evaluate(() => {
			const player = (window as any).playerWA;
			const ctx = player.audioContext();
			return ctx?.sampleRate ?? 0;
		});

		expect(sampleRate).toBeGreaterThan(0);
	});

	test('AudioContext.state transitions to running on play()', async ({ page }) => {
		const finalState = await page.evaluate(async () => {
			const player = (window as any).playerWA;
			const backend = player.backend();

			await new Promise<void>((resolve, reject) => {
				const timeout = setTimeout(() => reject(new Error('canplay timeout')), 10_000);
				backend.on('canplay', () => { clearTimeout(timeout); resolve(); });
				backend.load('/e2e/media/trackA.mp3');
			});

			await backend.play();

			// AudioContext.resume() is async — give it a tick.
			await new Promise<void>(r => setTimeout(r, 100));

			return player.audioContext()?.state ?? 'unavailable';
		});

		expect(finalState).toBe('running');
	});

	test('getByteFrequencyData returns non-zero bins during playback of 440 Hz tone', async ({ page }) => {
		const {
			maxBin,
			maxValue,
			binCount,
			sampleRate,
			fftSize,
		} = await page.evaluate(async () => {
			const player = (window as any).playerWA;
			const AudioGraphPlugin = (window as any).AudioGraphPlugin;

			const backend = player.backend();
			const graph = player.getPlugin(AudioGraphPlugin);

			await new Promise<void>((resolve, reject) => {
				const timeout = setTimeout(() => reject(new Error('canplay timeout')), 10_000);
				backend.on('canplay', () => { clearTimeout(timeout); resolve(); });
				backend.load('/e2e/media/trackA.mp3');
			});

			await backend.play();

			// Let the buffer fill — wait 300 ms of real playback.
			await new Promise<void>(r => setTimeout(r, 300));

			const analyser = graph.analyserSource();
			const buf = new Uint8Array(analyser.frequencyBinCount);
			analyser.getByteFrequencyData(buf);

			// Find peak bin.
			let maxBin = 0;
			let maxValue = 0;
			for (let i = 0; i < buf.length; i++) {
				if ((buf[i] ?? 0) > maxValue) {
					maxValue = buf[i] ?? 0;
					maxBin = i;
				}
			}

			return {
				maxBin,
				maxValue,
				binCount: buf.length,
				sampleRate: analyser.context.sampleRate,
				fftSize: analyser.fftSize,
			};
		});

		// Non-zero energy proves real audio flows through the graph.
		expect(maxValue).toBeGreaterThan(0);

		// binCount must equal fftSize / 2 — proves the AnalyserNode is configured
		// correctly (frequencyBinCount is always fftSize/2 per the Web Audio spec).
		expect(binCount).toBe(fftSize / 2);

		// Compute the expected bin for 440 Hz:
		//   binHz = sampleRate / fftSize
		//   expectedBin = Math.round(440 / binHz)
		const binHz = sampleRate / fftSize;
		const expectedBin = Math.round(440 / binHz);

		// Allow ±5 bins tolerance for browser pitch variance and bin aliasing.
		expect(maxBin).toBeGreaterThanOrEqual(expectedBin - 5);
		expect(maxBin).toBeLessThanOrEqual(expectedBin + 5);
	});

	test('SpectrumPlugin.bandEnergy(400, 480) is non-zero during 440 Hz playback', async ({ page }) => {
		const energy = await page.evaluate(async () => {
			const player = (window as any).playerWA;
			const SpectrumPlugin = (window as any).SpectrumPlugin;
			const backend = player.backend();

			await new Promise<void>((resolve, reject) => {
				const timeout = setTimeout(() => reject(new Error('canplay timeout')), 10_000);
				backend.on('canplay', () => { clearTimeout(timeout); resolve(); });
				backend.load('/e2e/media/trackA.mp3');
			});

			await backend.play();
			await new Promise<void>(r => setTimeout(r, 300));

			const spectrum = player.getPlugin(SpectrumPlugin);
			return spectrum?.bandEnergy(400, 480) ?? -1;
		});

		// trackA.mp3 is a 440 Hz tone — energy in [400, 480] Hz must be significant.
		expect(energy).toBeGreaterThan(0);
	});
});
