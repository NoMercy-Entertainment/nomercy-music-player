// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import { resolve } from 'node:path';
/// <reference types="vitest" />
import { fileURLToPath } from 'node:url';
import { nomercyTranslationsPlugin } from '@nomercy-entertainment/nomercy-player-core/vite-plugin';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

const selfRoot = fileURLToPath(new URL('./src', import.meta.url));

export default defineConfig({
	base: '/',
	publicDir: resolve(__dirname, 'public'),
	plugins: [dts(), nomercyTranslationsPlugin()],
	resolve: {
		alias: [
			{
				find: '@nomercy-entertainment/nomercy-music-player',
				replacement: `${selfRoot}/index.ts`,
			},
		],
	},
	build: {
		sourcemap: false,
		minify: 'terser',
		target: 'es2022',
		rollupOptions: {
			input: ['./src/index.ts'],
			external: ['hls.js'],
			output: {
				globals: {
					'hls.js': 'Hls',
				},
			},
		},
		lib: {
			entry: resolve(__dirname, 'src/index.ts'),
			name: 'nmMPlayer',
			formats: ['es', 'cjs', 'umd'],
			fileName: 'nomercy-music-player',
		},
	},
	clearScreen: true,
});
