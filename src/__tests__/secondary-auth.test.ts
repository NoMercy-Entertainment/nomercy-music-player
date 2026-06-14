/**
 * Secondary-load auth regression suite (Bug 2).
 *
 * Root cause: WebAudioBackend.loadSecondary() assigned `el.src = url` raw,
 * without applying the auth token. On authenticated NoMercy servers the
 * secondary load returned HTTP 401 → MediaError code 4 → crossfade failure.
 *
 * Fix: loadSecondary resolves `_authHeaderProvider?.()` and applies
 * `appendAuthTokenParam` (or hls.js xhrSetup for HLS URLs) identically to
 * the primary load() path.
 *
 * What these tests verify:
 *   1. When an auth provider is wired and the URL is non-HLS, loadSecondary
 *      appends the token to el.src.
 *   2. When no auth provider is wired, loadSecondary still works (token-free).
 *   3. appendAuthTokenParam is called with the resolved token, not raw undefined.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebAudioBackend } from '../adapters/audio-backend/web-audio';

// ── AudioContext stub ──────────────────────────────────────────────────────────

class MockAudioContext {
	state: AudioContextState = 'running';
	currentTime = 0;
	destination = {} as AudioDestinationNode;

	createGain = vi.fn(() => ({
		gain: {
			value: 0,
			setTargetAtTime: vi.fn(),
			cancelScheduledValues: vi.fn(),
			setValueAtTime: vi.fn(),
			linearRampToValueAtTime: vi.fn(),
		},
		connect: vi.fn(),
		disconnect: vi.fn(),
	}));

	createAnalyser = vi.fn(() => ({
		fftSize: 2048,
		connect: vi.fn(),
		disconnect: vi.fn(),
	}));

	createMediaElementSource = vi.fn(() => ({
		connect: vi.fn(),
		disconnect: vi.fn(),
	}));

	resume = vi.fn((): Promise<void> => Promise.resolve());
}

function installAudioContext(): void {
	(globalThis as unknown as { AudioContext: typeof MockAudioContext }).AudioContext = MockAudioContext;
}

function removeAudioContext(): void {
	delete (globalThis as unknown as { AudioContext?: unknown }).AudioContext;
}

function makeContainer(): HTMLDivElement {
	const div = document.createElement('div');
	document.body.appendChild(div);
	return div;
}

function fireMetadata(container: HTMLElement): void {
	const audios = container.querySelectorAll('audio');
	const target = audios[audios.length - 1];
	target?.dispatchEvent(new Event('loadedmetadata'));
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('WebAudioBackend — loadSecondary auth (Bug 2 regression)', () => {
	beforeEach(() => {
		installAudioContext();
	});

	afterEach(() => {
		removeAudioContext();
		document.body.innerHTML = '';
	});

	it('appends the auth token to el.src when provider is wired', async () => {
		const container = makeContainer();
		const backend = new WebAudioBackend(container);

		backend.setAuthHeaderProvider(async (): Promise<string> => 'Bearer test-token-123');

		const loadPromise = backend.loadSecondary('http://media.example.test/track.mp3');
		fireMetadata(container);
		await loadPromise;

		// The secondary element should have the token appended as a query param.
		const audios = container.querySelectorAll('audio');
		const secondaryEl = audios[audios.length - 1] as HTMLAudioElement;

		// appendAuthTokenParam encodes the token as `?token=<value>` or
		// `&token=<value>`. Verify the src contains the token value.
		expect(secondaryEl.src).toContain('test-token-123');
	});

	it('loads without token when no auth provider is wired', async () => {
		const container = makeContainer();
		const backend = new WebAudioBackend(container);

		// No setAuthHeaderProvider call — should still resolve.
		const loadPromise = backend.loadSecondary('http://media.example.test/track.mp3');
		fireMetadata(container);

		await expect(loadPromise).resolves.toBeUndefined();

		const audios = container.querySelectorAll('audio');
		const secondaryEl = audios[audios.length - 1] as HTMLAudioElement;
		expect(secondaryEl.src).toContain('media.example.test');
	});

	it('auth token is resolved fresh on each loadSecondary call (provider is re-invoked)', async () => {
		const container = makeContainer();
		const backend = new WebAudioBackend(container);

		const tokenProvider = vi.fn(async (): Promise<string> => 'Bearer fresh-token');
		backend.setAuthHeaderProvider(tokenProvider);

		const p1 = backend.loadSecondary('http://media.example.test/a.mp3');
		fireMetadata(container);
		await p1;

		backend.disposeSecondary();

		const p2 = backend.loadSecondary('http://media.example.test/b.mp3');
		fireMetadata(container);
		await p2;

		// Provider must have been called at least twice — once per loadSecondary.
		expect(tokenProvider.mock.calls.length).toBeGreaterThanOrEqual(2);
	});
});
