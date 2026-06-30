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
	// Serial. These specs drive a real AudioContext and decode real audio; under
	// concurrent headless browsers the autoplay-resume timing and the shared audio
	// device contend, which flakes the FFT-energy assertions. One worker is the
	// reliable contract for real-audio e2e.
	workers: 1,
	retries: process.env.CI ? 2 : 1,
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
