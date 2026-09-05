// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * `auth.mediaAuthorization` → `IAudioBackend.setAuthHeaderProvider` bridge.
 *
 * The provider is read lazily per request from the LIVE auth config, so a rule
 * installed with `player.auth(...)` after setup reaches media requests. Reading
 * `options.auth` instead would answer from the setup config forever.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioElementBackend } from '../adapters/audio-backend/html5-audio';
import { NMMusicPlayer } from '../index';

describe('mediaAuthorization reads the live auth config', () => {
	beforeEach(() => {
		document.body.innerHTML = '<div id="media-auth-test"></div>';
		(NMMusicPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
	});

	afterEach(() => {
		document.body.innerHTML = '';
		(NMMusicPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		vi.restoreAllMocks();
	});

	it('uses the rule supplied at setup', () => {
		const spy = vi.spyOn(AudioElementBackend.prototype, 'setAuthHeaderProvider');
		const musicPlayer = new NMMusicPlayer('media-auth-test').setup({
			auth: {
				mediaAuthorization: () => 'Bearer from-setup',
			},
		});

		musicPlayer.backend();

		const provider = spy.mock.calls[0]![0] as (url: string) => string | undefined;
		expect(provider('https://example.invalid/a.mp3')).toBe('Bearer from-setup');
	});

	it('sees a rule installed with player.auth() after setup', () => {
		const spy = vi.spyOn(AudioElementBackend.prototype, 'setAuthHeaderProvider');
		const musicPlayer = new NMMusicPlayer('media-auth-test').setup({});

		musicPlayer.backend();

		musicPlayer.auth({
			mediaAuthorization: () => 'Bearer from-runtime',
		});

		const provider = spy.mock.calls[0]![0] as (url: string) => string | undefined;
		expect(provider('https://example.invalid/a.mp3')).toBe('Bearer from-runtime');
	});

	it('sees a rule replaced with player.auth() after setup', () => {
		const spy = vi.spyOn(AudioElementBackend.prototype, 'setAuthHeaderProvider');
		const musicPlayer = new NMMusicPlayer('media-auth-test').setup({
			auth: {
				mediaAuthorization: () => 'Bearer from-setup',
			},
		});

		musicPlayer.backend();

		musicPlayer.auth({
			mediaAuthorization: () => 'Bearer rotated',
		});

		const provider = spy.mock.calls[0]![0] as (url: string) => string | undefined;
		expect(provider('https://example.invalid/a.mp3')).toBe('Bearer rotated');
	});
});
