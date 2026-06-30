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

import { afterEach, describe, expect, it, vi } from 'vitest';
import { AudioElementBackend } from '../adapters/audio-backend/html5-audio';

// Minimal AudioContext stub — happy-dom has none. Enough for ensureSourceGraph
// to wire the baseline chain so we can assert the crossOrigin side effect.
class MockNode {
	gain = { value: 1 };
	connect = vi.fn();
	disconnect = vi.fn();
}
class MockAudioContext {
	state = 'running';
	currentTime = 0;
	destination = {} as AudioDestinationNode;
	createGain = vi.fn(() => new MockNode());
	createAnalyser = vi.fn(() => new MockNode());
	createMediaElementSource = vi.fn(() => new MockNode());
	resume = vi.fn(() => Promise.resolve());
}

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

describe('AudioElementBackend — crossOrigin when the graph is tapped', () => {
	it('sets crossOrigin = anonymous the first time a plugin taps outputNode()', () => {
		const container = document.createElement('div');
		document.body.appendChild(container);

		const backend = new AudioElementBackend(container);
		const el = backend.mediaElement() as HTMLAudioElement;

		// Direct transport: no CORS yet.
		expect(el.crossOrigin).not.toBe('anonymous');

		// A graph plugin requests the output node — CORS is now required so the
		// MediaElementAudioSourceNode receives audible (untainted) samples.
		const ctx = new MockAudioContext() as unknown as AudioContext;
		backend.outputNode(ctx);

		expect(el.crossOrigin).toBe('anonymous');
	});

	it('re-loads an already-sourced element so the new crossOrigin takes effect', () => {
		const container = document.createElement('div');
		document.body.appendChild(container);

		const backend = new AudioElementBackend(container);
		const el = backend.mediaElement() as HTMLAudioElement;
		el.src = 'https://cdn.example.com/track.mp3';
		const loadSpy = vi.spyOn(el, 'load');

		const ctx = new MockAudioContext() as unknown as AudioContext;
		backend.outputNode(ctx);

		expect(el.crossOrigin).toBe('anonymous');
		// crossOrigin only applies to the next load — the element must be reloaded.
		expect(loadSpy).toHaveBeenCalled();
	});
});
