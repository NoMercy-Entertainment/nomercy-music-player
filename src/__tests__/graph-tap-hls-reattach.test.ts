// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * Graph-tap-mid-HLS regression suite.
 *
 * `AudioElementBackend.applyGraphCrossOrigin()` sets `crossOrigin='anonymous'`
 * and called a bare `this.element.load()` to restore playback position when a
 * plugin taps the Web Audio graph (`outputNode()` / `analyserSource()`) AFTER
 * an hls.js-backed stream has started. `element.load()` resets the media
 * pipeline to HAVE_NOTHING, which aborts hls.js's MediaSource attachment
 * behind its back — `this.hlsInstance` is left dangling and nothing
 * re-attaches, silently killing HLS playback.
 *
 * Fix: when `this.hlsInstance` is present, re-attach through hls.js
 * (`hlsInstance.attachMedia(el)`) instead of a bare `element.load()`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioElementBackend } from '../adapters/audio-backend/html5-audio';

// Stub hls.js so the dynamic import in html5-audio.ts resolves under Vitest.
// attachMedia mirrors real hls.js by assigning a MediaSource blob URL to the
// element — that's what makes `applyGraphCrossOrigin()`'s `hadSource` check
// true, exercising the reload/reattach branch.
vi.mock('hls.js', () => {
	class FakeHls {
		static isSupported = (): boolean => true;
		static instances: FakeHls[] = [];

		attachMedia = vi.fn((el: HTMLMediaElement) => {
			el.src = 'blob:mock-media-source';
		});

		loadSource = vi.fn();
		detachMedia = vi.fn();
		destroy = vi.fn();
		startLoad = vi.fn();
		stopLoad = vi.fn();

		constructor() {
			FakeHls.instances.push(this);
		}
	}
	return { default: FakeHls };
});

interface FakeHlsInstance {
	attachMedia: ReturnType<typeof vi.fn>;
	loadSource: ReturnType<typeof vi.fn>;
}

interface FakeHlsModule {
	instances: FakeHlsInstance[];
}

function makeContainer(): HTMLDivElement {
	const div = document.createElement('div');
	document.body.appendChild(div);
	return div;
}

function makeFakeAudioContext(): AudioContext {
	const makeNode = (): { connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> } => ({
		connect: vi.fn(),
		disconnect: vi.fn(),
	});

	return {
		createMediaElementSource: vi.fn(() => makeNode()),
		createAnalyser: vi.fn(() => ({ fftSize: 2048, ...makeNode() })),
		createGain: vi.fn(() => makeNode()),
		destination: {},
	} as unknown as AudioContext;
}

/** Flush the dynamic `import('hls.js')` + the load() Promise executor's task chain. */
async function flushMicrotasks(iterations = 10): Promise<void> {
	for (let i = 0; i < iterations; i++) {
		await new Promise<void>(resolve => setTimeout(resolve, 0));
	}
}

describe('AudioElementBackend — graph tap mid-HLS (Bug 3)', () => {
	let container: HTMLDivElement;
	let backend: AudioElementBackend;

	beforeEach(() => {
		container = makeContainer();
		backend = new AudioElementBackend(container);
	});

	afterEach(() => {
		backend.dispose();
		document.body.innerHTML = '';
	});

	it('re-attaches the hls.js instance instead of calling element.load() when tapping mid-stream', async () => {
		const loadPromise = backend.load('http://test/stream.m3u8');

		await flushMicrotasks();
		backend.mediaElement().dispatchEvent(new Event('loadedmetadata'));
		await loadPromise;

		const hlsModule = (await import('hls.js')).default as unknown as FakeHlsModule;
		const hlsInstance = hlsModule.instances[hlsModule.instances.length - 1]!;
		expect(hlsInstance).toBeDefined();
		hlsInstance.attachMedia.mockClear();

		const elementLoadSpy = vi.spyOn(backend.mediaElement(), 'load');

		// A plugin taps the graph after HLS playback has already started.
		backend.analyserSource(makeFakeAudioContext());

		expect(hlsInstance.attachMedia).toHaveBeenCalledTimes(1);
		expect(elementLoadSpy).not.toHaveBeenCalled();
	});
});
