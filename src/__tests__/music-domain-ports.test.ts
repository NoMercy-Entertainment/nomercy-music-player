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
 *   - LrcFileSource.resolve() — returns lyricsUrl or undefined
 *   - LinearPlaylistGenerator.next() — sequential + end-of-queue
 *   - SmartShuffleGenerator.next() — does not return current on non-singleton queue
 *   - NoopScrobbler.scrobble() — resolves, no side effects
 *   - MediaSessionArtProvider.publish() — writes navigator.mediaSession.metadata (or no-ops when absent)
 */

import type { IAudioBackend } from '../adapters/audio-backend/IAudioBackend';
import type { MusicPlaylistItem } from '../types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LrcFileSource } from '../adapters/lyric-source/lrc-file';
import { MediaSessionArtProvider } from '../adapters/now-playing-art/media-session';
import { LinearPlaylistGenerator } from '../adapters/playlist-generator/linear';
import { SmartShuffleGenerator } from '../adapters/playlist-generator/smart-shuffle';
import { NoopScrobbler } from '../adapters/scrobbler/noop';
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

// ── Group 2: LrcFileSource ────────────────────────────────────────────────────

describe('LrcFileSource.resolve()', () => {
	/**
	 * LrcFileSource is a URL-resolver only — it exposes resolve(item) returning
	 * the item's lyricsUrl. The actual HTTP fetch + LRC parse is done by the
	 * LyricsPlugin via this.fetch(). There is no load() method.
	 */
	it('test 3 — returns undefined when track has no lyricsUrl', () => {
		const src = new LrcFileSource();
		const track = makeTrack({ lyricsUrl: undefined });

		const result = src.resolve(track);

		expect(result).toBeUndefined();
	});

	it('test 4 — returns the lyricsUrl string when the track has one', () => {
		const src = new LrcFileSource();
		const track = makeTrack({ lyricsUrl: 'http://test/lyrics.lrc' });

		const result = src.resolve(track);

		expect(result).toBe('http://test/lyrics.lrc');
	});
});

// ── Group 3: IPlaylistGenerator implementations ───────────────────────────────

describe('LinearPlaylistGenerator', () => {
	it('test 5 — next(items, 0) returns index 1 (the item after current)', () => {
		const gen = new LinearPlaylistGenerator();
		const items: MusicPlaylistItem[] = [
			makeTrack({ id: 'a', name: 'A' }),
			makeTrack({ id: 'b', name: 'B' }),
			makeTrack({ id: 'c', name: 'C' }),
		];

		const next = gen.next(items, 0);

		expect(next).toBe(1);
	});

	/**
	 * FINDING: LinearPlaylistGenerator returns undefined at end of queue (no ring).
	 * The implementation is: nextIndex < items.length ? nextIndex : undefined.
	 * AutoAdvancePlugin must handle undefined gracefully — null propagation risk
	 * if it calls player.next() without checking the generator result.
	 */
	it('test 6 — next() at end of queue returns undefined (no ring behavior)', () => {
		const gen = new LinearPlaylistGenerator();
		const items: MusicPlaylistItem[] = [
			makeTrack({ id: 'a', name: 'A' }),
			makeTrack({ id: 'b', name: 'B' }),
			makeTrack({ id: 'c', name: 'C' }),
		];

		const next = gen.next(items, 2);

		// Linear generator does NOT wrap — returns undefined at the end.
		expect(next).toBeUndefined();
	});
});

describe('SmartShuffleGenerator', () => {
	it('test 7 — next() does not return currentIndex on a non-singleton queue', () => {
		const gen = new SmartShuffleGenerator();
		const items: MusicPlaylistItem[] = [
			makeTrack({ id: 'a', name: 'A' }),
			makeTrack({ id: 'b', name: 'B' }),
			makeTrack({ id: 'c', name: 'C' }),
		];

		// Run multiple times — shuffle must never repeat the current index.
		for (let i = 0; i < 20; i++) {
			const next = gen.next(items, 0);
			expect(next).not.toBe(0);
		}
	});
});

// ── Group 4: NoopScrobbler ────────────────────────────────────────────────────

describe('NoopScrobbler', () => {
	it('test 8 — scrobble() resolves without throwing or producing side effects', async () => {
		const scrobbler = new NoopScrobbler();
		const track = makeTrack();
		const context = {
			startedAt: Date.now() / 1000,
			listenedSeconds: 120,
			durationSeconds: 240,
			source: 'user' as const,
		};

		const result = await scrobbler.scrobble(track, context);

		expect(result).toBeUndefined();
	});

	it('nowPlaying() also resolves without throwing', async () => {
		const scrobbler = new NoopScrobbler();
		const track = makeTrack();

		const result = await scrobbler.nowPlaying!(track);

		expect(result).toBeUndefined();
	});
});

// ── Group 5: MediaSessionArtProvider ─────────────────────────────────────────

describe('MediaSessionArtProvider.publish()', () => {
	/**
	 * jsdom does not implement navigator.mediaSession. The implementation
	 * guards this: `if (typeof navigator === 'undefined' || !navigator.mediaSession) return`.
	 *
	 * Test 9a: mock navigator.mediaSession so we can assert the write.
	 * Test 9b: confirm the no-op guard fires when mediaSession is absent.
	 */

	it('test 9a — writes navigator.mediaSession.metadata when the API is available', async () => {
		const provider = new MediaSessionArtProvider();
		const track = makeTrack({ name: 'Hello World', artist: 'Artist', album: 'Album' });
		const artwork = 'http://test/art.jpg';

		const setMetadata = vi.fn();

		// MediaMetadata is not available in happy-dom — stub it with a
		// real class so `new MediaMetadata(...)` works as a constructor.
		interface MediaMetadataInit { title?: string; artist?: string; album?: string; artwork?: object[] }
		const OriginalMediaMetadata = (globalThis as any).MediaMetadata as unknown;
		class MediaMetadataStub {
			title: string;
			artist: string;
			album: string;
			artwork: object[];
			constructor(init: MediaMetadataInit) {
				this.title = init.title ?? '';
				this.artist = init.artist ?? '';
				this.album = init.album ?? '';
				this.artwork = init.artwork ?? [];
			}
		}
		(globalThis as any).MediaMetadata = MediaMetadataStub;

		Object.defineProperty(globalThis, 'navigator', {
			value: {
				...globalThis.navigator,
				mediaSession: {
					get metadata() { return null; },
					set metadata(value: object | null) { setMetadata(value); },
				},
			},
			writable: true,
			configurable: true,
		});

		try {
			await provider.publish(track, artwork);

			expect(setMetadata).toHaveBeenCalledTimes(1);

			const meta = setMetadata.mock.calls[0]![0] as { title: string; artist: string; album: string };
			expect(meta.title).toBe('Hello World');
			expect(meta.artist).toBe('Artist');
			expect(meta.album).toBe('Album');
		}
		finally {
			(globalThis as any).MediaMetadata = OriginalMediaMetadata;
			Object.defineProperty(globalThis, 'navigator', {
				value: { ...globalThis.navigator, mediaSession: undefined },
				writable: true,
				configurable: true,
			});
		}
	});

	it('test 9b — is a no-op when navigator.mediaSession is absent (jsdom environment)', async () => {
		const provider = new MediaSessionArtProvider();
		const track = makeTrack({ name: 'Absent' });

		// In jsdom navigator.mediaSession is absent — publish must resolve silently.
		await expect(provider.publish(track, undefined)).resolves.toBeUndefined();
	});
});
