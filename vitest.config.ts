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
						// Remaining subpath imports that resolve to bare .ts files (streams/*, cues/*).
						find: /^@nomercy-entertainment\/nomercy-player-core\/(.*)$/,
						replacement: `${coreRoot}/$1.ts`,
					},
					{
						find: '@nomercy-entertainment/nomercy-player-core',
						replacement: `${coreRoot}/index.ts`,
					},
				]
			: [],
	},
	test: {
		globals: true,
		environment: 'happy-dom',
		include: ['src/**/__tests__/**/*.test.ts'],
	},
});
