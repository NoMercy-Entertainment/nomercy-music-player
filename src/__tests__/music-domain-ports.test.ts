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
 *   - Crossfade depth: curve routing + negative startAt pass-through
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
	 * Formerly pinned the MEDIUM finding that opts.curve was silently dropped.
	 * The finding is fixed: IAudioBackend.crossfade takes an optional `curve`
	 * parameter and crossfadeTo() forwards the resolved curve
	 * (per-call opts > crossfadeDefaults.curve > linear).
	 */
	it('test 1 — backend.crossfade receives durationMs and the per-call curve', async () => {
		const { player, mock } = setupPlayer();

		await player.crossfadeTo(makeTrack(), { curve: 'linear', duration: 3 });

		expect(mock.crossfade).toHaveBeenCalledWith(3000, 'linear');
		expect(mock.crossfade).toHaveBeenCalledTimes(1);
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
