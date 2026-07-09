// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { nomercyTranslationsPlugin } from '@nomercy-entertainment/nomercy-player-core/vite-plugin';
import { defineConfig } from 'vitest/config';

const coreRoot = fileURLToPath(new URL('../nomercy-player-core/src', import.meta.url));
// hls.js is owned by nomercy-player-core (resolved transitively at runtime), so
// it is not in this package's node_modules. Alias it to a local stub so the
// dynamic `import('hls.js')` in the audio backends resolves under vitest. Tests
// that need real HLS behaviour mock it inline with vi.mock('hls.js', ...).
const hlsMock = fileURLToPath(new URL('./src/__tests__/__mocks__/hls.js.ts', import.meta.url));
// Monorepo: alias the core to its live TypeScript source so tests pick up unbuilt
// changes. Standalone / CI: no sibling core checkout, so resolve the core from the
// installed @nomercy-entertainment/nomercy-player-core package via node_modules.
const useCoreSource = existsSync(coreRoot);

export default defineConfig({
	plugins: [nomercyTranslationsPlugin()],
	resolve: {
		alias: useCoreSource
			? [
					{
						find: 'hls.js',
						replacement: hlsMock,
					},
					{
						find: '@nomercy-entertainment/nomercy-player-core/testing',
						replacement: `${coreRoot}/testing/index.ts`,
					},
					{
						find: '@nomercy-entertainment/nomercy-player-core/vite-plugin',
						replacement: `${coreRoot}/vite-plugin.ts`,
					},
					// Directory-based plugins whose entry is index.ts, not a bare file.
					{
						find: '@nomercy-entertainment/nomercy-player-core/plugins/key-handler',
						replacement: `${coreRoot}/plugins/key-handler/index.ts`,
					},
					{
						find: '@nomercy-entertainment/nomercy-player-core/plugins/media-session',
						replacement: `${coreRoot}/plugins/media-session/index.ts`,
					},
					{
						find: '@nomercy-entertainment/nomercy-player-core/plugins/tab-leader',
						replacement: `${coreRoot}/plugins/tab-leader/index.ts`,
					},
					{
						find: '@nomercy-entertainment/nomercy-player-core/plugins/embed',
						replacement: `${coreRoot}/plugins/embed/index.ts`,
					},
					{
						find: '@nomercy-entertainment/nomercy-player-core/plugins/message',
						replacement: `${coreRoot}/plugins/message/index.ts`,
					},
					{
						find: '@nomercy-entertainment/nomercy-player-core/plugins/audio-graph',
						replacement: `${coreRoot}/plugins/audio-graph/index.ts`,
					},
					{
						find: '@nomercy-entertainment/nomercy-player-core/plugins/canvas',
						replacement: `${coreRoot}/plugins/canvas/index.ts`,
					},
					{
						find: '@nomercy-entertainment/nomercy-player-core/plugins/mixer',
						replacement: `${coreRoot}/plugins/mixer/index.ts`,
					},
					{
						find: '@nomercy-entertainment/nomercy-player-core/plugins/equalizer',
						replacement: `${coreRoot}/plugins/equalizer/index.ts`,
					},
					{
						find: '@nomercy-entertainment/nomercy-player-core/plugins/spectrum',
						replacement: `${coreRoot}/plugins/spectrum/index.ts`,
					},
					{
						find: '@nomercy-entertainment/nomercy-player-core/plugins/visualization',
						replacement: `${coreRoot}/plugins/visualization/index.ts`,
					},
					{
						// The kit's ./streams/* export keys resolve INTO dist/adapters/stream/*;
						// their source counterparts live under src/adapters/stream/, not
						// src/streams/, so the bare-file regex below cannot reach them.
						find: '@nomercy-entertainment/nomercy-player-core/streams/native',
						replacement: `${coreRoot}/adapters/stream/native.ts`,
					},
					{
						find: '@nomercy-entertainment/nomercy-player-core/streams/hls',
						replacement: `${coreRoot}/adapters/stream/hls.ts`,
					},
					{
						// Remaining subpath imports that resolve to bare .ts files (cues/*).
						find: /^@nomercy-entertainment\/nomercy-player-core\/(.*)$/,
						replacement: `${coreRoot}/$1.ts`,
					},
					{
						find: '@nomercy-entertainment/nomercy-player-core',
						replacement: `${coreRoot}/index.ts`,
					},
				]
			: [
					{
						find: 'hls.js',
						replacement: hlsMock,
					},
				],
	},
	test: {
		globals: true,
		environment: 'happy-dom',
		include: ['src/**/__tests__/**/*.test.ts'],
		coverage: {
			provider: 'v8',
			reporter: ['text', 'html', 'lcov'],
			include: ['src/**/*.ts'],
			exclude: [
				'src/**/__tests__/**',
				'src/**/*.d.ts',
			],
			thresholds: {
				lines: 70,
				functions: 75,
			},
		},
	},
});
