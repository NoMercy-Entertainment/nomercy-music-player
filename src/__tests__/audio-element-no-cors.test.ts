// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * Regression: AudioElementBackend must NOT set `crossOrigin = 'anonymous'` on
 * the primary or secondary `<audio>` element.
 *
 * The audio-element backend does not use `createMediaElementSource` — it drives
 * the `<audio>` element directly for transport. Forcing `crossOrigin=anonymous`
 * requires the server to supply CORS headers. CDN and remote audio URLs that
 * don't supply those headers cause the audio element to stall and never play
 * (P-2 regression documented in e2e/playback-regression.spec.ts).
 *
 * The WebAudio backend DOES need CORS because it routes audio through an
 * AudioContext graph via `createMediaElementSource`; that backend is
 * intentionally out of scope for this test.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { AudioElementBackend } from '../adapters/audio-backend/html5-audio';

afterEach(() => {
	document.body.innerHTML = '';
});

describe('AudioElementBackend — crossOrigin (P-2 regression)', () => {
	it('creates the primary <audio> element WITHOUT crossOrigin = anonymous', () => {
		const container = document.createElement('div');
		document.body.appendChild(container);

		const backend = new AudioElementBackend(container);
		const el = backend.mediaElement() as HTMLAudioElement;

		// crossOrigin must be null or '' — never 'anonymous'
		expect(el.crossOrigin).not.toBe('anonymous');
	});

	it('does not mutate crossOrigin when an external element is supplied without it set', () => {
		const container = document.createElement('div');
		document.body.appendChild(container);

		const external = document.createElement('audio');

		// Capture the pre-construction state so the assertion is relative to it,
		// not to a hard-coded value that differs across jsdom versions.
		const beforeConstruction = external.crossOrigin;

		// Construct the backend purely for its side effect on the passed element.
		const backend = new AudioElementBackend(container, { element: external });
		expect(backend).toBeDefined();

		// Backend must not have mutated the element's crossOrigin
		expect(external.crossOrigin).toBe(beforeConstruction);
	});

	it('creates the primary element inside the container when no element is supplied', () => {
		const container = document.createElement('div');
		document.body.appendChild(container);

		const backend = new AudioElementBackend(container);
		const el = backend.mediaElement() as HTMLAudioElement;

		// Verify the element is in the container
		expect(container.contains(el)).toBe(true);

		// And still has no CORS attribute
		expect(el.crossOrigin).not.toBe('anonymous');
	});
});
