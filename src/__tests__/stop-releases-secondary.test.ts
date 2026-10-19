// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * STOP must release the secondary (crossfade) <audio> element on both backends:
 * paused, source cleared and detached from the container.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { AudioElementBackend } from '../adapters/audio-backend/html5-audio';
import { WebAudioBackend } from '../adapters/audio-backend/web-audio';

class MockNode {
	gain = {
		value: 1,
		setTargetAtTime: vi.fn(),
		setValueAtTime: vi.fn(),
		linearRampToValueAtTime: vi.fn(),
		setValueCurveAtTime: vi.fn(),
		cancelScheduledValues: vi.fn(),
	};

	fftSize = 2048;
	connect = vi.fn();
	disconnect = vi.fn();
}

class MockAudioContext {
	state = 'running';
	currentTime = 0;
	destination = {};
	createGain = vi.fn(() => new MockNode());
	createAnalyser = vi.fn(() => new MockNode());
	createMediaElementSource = vi.fn(() => new MockNode());
	resume = vi.fn(() => Promise.resolve());
}

function makeContainer(): HTMLDivElement {
	const div = document.createElement('div');
	document.body.appendChild(div);
	return div;
}

function stubPlayback(element: HTMLAudioElement): void {
	Object.defineProperty(element, 'play', { value: vi.fn(() => Promise.resolve()), writable: true, configurable: true });
	Object.defineProperty(element, 'pause', { value: vi.fn(), writable: true, configurable: true });
}

async function loadSecondary(backend: AudioElementBackend | WebAudioBackend, container: HTMLElement): Promise<HTMLAudioElement> {
	const loading = backend.loadSecondary('https://cdn.example/next.mp3');
	const audios = container.querySelectorAll('audio');
	audios[audios.length - 1]!.dispatchEvent(new Event('loadedmetadata'));
	await loading;
	const secondary = container.querySelectorAll('audio')[1] as HTMLAudioElement;
	stubPlayback(secondary);
	return secondary;
}

const backends = [
	['AudioElementBackend', false],
	['WebAudioBackend', true],
] as const;

describe('stop() releases the secondary audio element', () => {
	afterEach(() => {
		delete (globalThis as any).AudioContext;
		document.body.innerHTML = '';
	});

	it.each(backends)('%s: a loaded secondary is paused, emptied and detached on stop()', async (_name, webAudio) => {
		if (webAudio)
			(globalThis as any).AudioContext = MockAudioContext;
		const container = makeContainer();
		const backend = webAudio ? new WebAudioBackend(container) : new AudioElementBackend(container);
		stubPlayback(backend.mediaElement());
		const secondary = await loadSecondary(backend, container);

		backend.stop();

		expect(secondary.pause).toHaveBeenCalled();
		expect(secondary.hasAttribute('src')).toBe(false);
		expect(container.contains(secondary)).toBe(false);
		expect(backend.mediaElement().pause).toHaveBeenCalled();
	});

	it.each(backends)('%s: stop() mid-crossfade leaves no secondary element behind', async (_name, webAudio) => {
		if (webAudio)
			(globalThis as any).AudioContext = MockAudioContext;
		const container = makeContainer();
		const backend = webAudio ? new WebAudioBackend(container) : new AudioElementBackend(container);
		stubPlayback(backend.mediaElement());
		const secondary = await loadSecondary(backend, container);

		const fade = backend.crossfade(100);
		backend.stop();

		expect(secondary.pause).toHaveBeenCalled();
		expect(container.contains(secondary)).toBe(false);
		await expect(fade).resolves.toBeUndefined();
	});
});
