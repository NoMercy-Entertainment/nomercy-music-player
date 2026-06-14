// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: 'e2e',
	timeout: 30_000,
	reporter: [['html', { outputFolder: 'reports/playwright' }]],
	use: {
		baseURL: 'http://localhost:5504',
		headless: true,
	},
	webServer: {
		command: 'npx vite --port 5504 --force',
		port: 5504,
		reuseExistingServer: !process.env.CI,
	},
});
