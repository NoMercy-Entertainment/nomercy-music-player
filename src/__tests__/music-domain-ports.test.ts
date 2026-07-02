// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * Slice 08 — Music domain-port unit tests.
 *
 * Covers:
 *   - Crossfade depth: curve routing (MEDIUM finding) + negative startAt pass-through
 *
 * The port-adapter groups formerly here moved with their v2 API-consistency
 * pass:
 *   - LrcFileSource / MediaSessionArtProvider — deleted (redundant with
 *     `LyricsPlugin` / `MediaSessionPlugin`, which already own this work).
 *   - LinearPlaylistGenerator / SmartShuffleGenerator — moved to
 *     `__tests__/plugins/auto-advance-generator.test.ts` alongside their new
 *     home under `plugins/auto-advance/`.
 *   - NoopScrobbler / ScrobblePlugin — moved to
 *     `__tests__/plugins/scrobble.test.ts` alongside their new home under
 *     `plugins/scrobble/`.
 */

import type { IAudioBackend } from '../adapters/audio-backend/IAudioBackend';
import type { MusicPlaylistItem } from '../types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NMMusicPlayer } from '../index';

// ── Shared helpers ────────────────────────────────────────────────────────────

function makeTrack(overrides: Partial<MusicPlaylistItem> = {}): MusicPlaylistItem {
	return { id: '1', name: 'Track A', url: 'http://test/a.mp3', ...overrides };
}

function makeMockBackend(overrides: Partial<IAudioBackend> = {}): IAudioBackend {
	return {
		kind: 'audio-element',
		load: vi.fn(() => Promise.resolve()),
		unload: vi.fn(),
		dispose: vi.fn(),
		play: vi.fn(() => Promise.resolve()),
		pause: vi.fn(),
		stop: vi.fn(),
		currentTime: vi.fn(() => 0) as any,
		duration: vi.fn(() => 0),
		buffered: vi.fn(() => 0),
		bufferedRanges: vi.fn(() => ({ length: 0 } as unknown as TimeRanges)),
		seekable: vi.fn(() => ({ length: 0 } as unknown as TimeRanges)),
		playbackRate: vi.fn(() => 1) as any,
		volume: vi.fn(() => 0.8) as any,
		mute: vi.fn(),
		unmute: vi.fn(),
		state: vi.fn(() => 'idle' as const),
		outputNode: vi.fn(() => ({} as AudioNode)),
		analyserSource: vi.fn(() => ({} as AudioNode)),
		mediaElement: vi.fn(() => document.createElement('audio')),
		captureStream: vi.fn(() => ({} as MediaStream)),
		setSinkId: vi.fn(() => Promise.resolve()),
		getSinkId: vi.fn(() => ''),
		mediaKeys: vi.fn(() => undefined),
		setMediaKeys: vi.fn(() => Promise.resolve()),
		outputProtectionState: vi.fn(() => 'unsupported' as const),
		pauseLoader: vi.fn(),
		resumeLoader: vi.fn(),
		loaderState: vi.fn(() => 'running' as const),
		on: vi.fn(),
		off: vi.fn(),
		supportsCrossfade: vi.fn(() => true),
		loadSecondary: vi.fn(() => Promise.resolve()),
		disposeSecondary: vi.fn(),
		primeSecondary: vi.fn(() => Promise.resolve()),
		crossfade: vi.fn(() => Promise.resolve()),
		secondaryGain: vi.fn(() => 0) as any,
		...overrides,
	};
}

function setupPlayer(): { player: NMMusicPlayer; mock: IAudioBackend } {
	const div = document.createElement('div');
	div.id = 'port-test';
	document.body.appendChild(div);

	const player = new NMMusicPlayer('port-test');
	player.setup({});

	const mock = makeMockBackend();
	(player as any)._backend = mock;

	return { player, mock };
}

// ── Group 1: Crossfade depth ──────────────────────────────────────────────────

describe('NMMusicPlayer.crossfadeTo() — curve routing', () => {
	beforeEach(() => {
		(NMMusicPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
	});

	afterEach(() => {
		(NMMusicPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		document.body.innerHTML = '';
	});

	/**
	 * FINDING: crossfadeTo() drops opts.curve — IAudioBackend.crossfade() is
	 * declared as crossfade(durationMs: number) with no curve parameter.
	 * CrossfadeOptions.curve is accepted at the call site but never forwarded.
	 * Severity: MEDIUM — the curve option silently has no effect.
	 *
	 * This test pins the CURRENT behavior: backend.crossfade is called with
	 * durationMs only, regardless of opts.curve.
	 */
	it('test 1 — backend.crossfade receives durationMs only; opts.curve is silently dropped (MEDIUM finding: IAudioBackend.crossfade has no curve param)', async () => {
		const { player, mock } = setupPlayer();

		await player.crossfadeTo(makeTrack(), { curve: 'linear', duration: 3 });

		// crossfade is called with exactly one argument — the duration in ms.
		// curve is NOT forwarded because the interface has no curve parameter.
		expect(mock.crossfade).toHaveBeenCalledWith(3000);
		expect(mock.crossfade).toHaveBeenCalledTimes(1);

		const callArgs = (mock.crossfade as ReturnType<typeof vi.fn>).mock.calls[0] as unknown[];
		expect(callArgs).toHaveLength(1);
	});

	/**
	 * startAt: -1 is passed through to backend.primeSecondary without a guard.
	 * The implementation at index.ts:562 does `backend.primeSecondary(opts?.startAt)`
	 * unconditionally — no negative-value check. Pin this pass-through behavior.
	 */
	it('test 2 — crossfadeTo() with startAt:-1 passes the negative value through to backend.primeSecondary without throwing', async () => {
		const { player, mock } = setupPlayer();

		await expect(
			player.crossfadeTo(makeTrack(), { startAt: -1, duration: 2 }),
		).resolves.toBeUndefined();

		expect(mock.primeSecondary).toHaveBeenCalledWith(-1);
	});
});
