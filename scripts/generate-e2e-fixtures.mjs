// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * Generates the deterministic audio fixtures the e2e suite drives through a real
 * browser. Produced by the NoMercy FFmpeg fork (resolved by ensure-ffmpeg.mjs),
 * never a system ffmpeg, so the fixtures match the encoder the product ships.
 *
 * The tone frequencies are load-bearing: the WebAudio analyser specs assert FFT
 * energy at the bin for these exact frequencies, so do not change them without
 * updating the spectrum assertions.
 *
 * Outputs into e2e/media/:
 *   trackA.mp3   440Hz tone, 3s   (analyser/equalizer target)
 *   trackB.mp3   880Hz tone, 3s   (crossfade target — distinct bin from A)
 *   short.mp3    660Hz tone, 1s   (ended-event target)
 *
 * Run: `node scripts/generate-e2e-fixtures.mjs` (also exposed as `pretest:e2e`).
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { ensureFfmpeg } from './ensure-ffmpeg.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const mediaDir = join(here, '..', 'e2e', 'media');

const TONES = [
	{
		file: 'trackA.mp3',
		frequency: 440,
		duration: 3,
	},
	{
		file: 'trackB.mp3',
		frequency: 880,
		duration: 3,
	},
	{
		file: 'short.mp3',
		frequency: 660,
		duration: 1,
	},
];

function run(ffmpeg, args) {
	const result = spawnSync(ffmpeg, ['-y', '-loglevel', 'error', ...args], {
		encoding: 'utf8',
		cwd: mediaDir,
	});
	if (result.status !== 0)
		throw new Error(`ffmpeg failed: ${args.join(' ')}\n${result.stderr}`);
}

async function main() {
	const ffmpeg = await ensureFfmpeg();
	mkdirSync(mediaDir, { recursive: true });

	for (const tone of TONES) {
		run(ffmpeg, [
			'-f',
			'lavfi',
			'-i',
			`sine=frequency=${tone.frequency}:duration=${tone.duration}`,
			'-c:a',
			'libmp3lame',
			'-q:a',
			'9',
			tone.file,
		]);
	}

	console.log(`e2e fixtures generated in ${mediaDir} using ${ffmpeg}`);
}

main().catch((error) => {
	console.error(error.message);
	process.exit(1);
});
