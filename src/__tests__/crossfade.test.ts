/**
 * NMMusicPlayer.crossfadeTo() orchestration tests.
 *
 * The backend is replaced with a lightweight mock that satisfies the full
 * IAudioBackend crossfade contract without touching DOM or Web Audio.
 * This keeps tests fast and deterministic.
 */

import type { IAudioBackend } from '../adapters/audio-backend/IAudioBackend';
import type { MusicPlaylistItem } from '../types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NMMusicPlayer } from '../index';

// ── Mock backend ──────────────────────────────────────────────────────────────

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTrack(url = 'http://test/track.mp3'): MusicPlaylistItem {
	return { id: '1', name: 'Test Track', url };
}

function setup(): { player: NMMusicPlayer; mock: IAudioBackend } {
	const div = document.createElement('div');
	div.id = 'xfade-test';
	document.body.appendChild(div);

	const player = new NMMusicPlayer('xfade-test');
	player.setup({});

	const mock = makeMockBackend();

	// Inject the mock as the active backend via the public accessor.
	// `backend()` is the getter overload; we replace _backend directly via
	// a cast so the player delegates all crossfade calls to our mock.
	(player as any)._backend = mock;

	return { player, mock };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('NMMusicPlayer.crossfadeTo()', () => {
	beforeEach(() => {
		(NMMusicPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
	});

	afterEach(() => {
		(NMMusicPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		document.body.innerHTML = '';
	});

	describe('event sequence', () => {
		it('emits crossfadeStart then crossfadeComplete', async () => {
			const { player } = setup();
			const events: string[] = [];
			player.on('crossfadeStart' as any, () => events.push('crossfadeStart'));
			player.on('crossfadeComplete' as any, () => events.push('crossfadeComplete'));

			await player.crossfadeTo(makeTrack());

			expect(events).toEqual(['crossfadeStart', 'crossfadeComplete']);
		});

		it('crossfadeStart payload carries from, to, duration', async () => {
			const { player } = setup();
			let payload: any;
			player.on('crossfadeStart' as any, (data: any) => { payload = data; });

			const track = makeTrack();
			await player.crossfadeTo(track, { duration: 4 });

			expect(payload).toMatchObject({
				to: track,
				duration: 4000, // converted to ms
			});
		});

		it('crossfadeComplete payload carries the incoming track', async () => {
			const { player } = setup();
			let payload: any;
			player.on('crossfadeComplete' as any, (data: any) => { payload = data; });

			const track = makeTrack();
			await player.crossfadeTo(track);

			expect(payload).toMatchObject({ track });
		});
	});

	describe('isTransitioning()', () => {
		it('is false before a crossfade', () => {
			const { player } = setup();
			expect(player.isTransitioning()).toBe(false);
		});

		it('is true during the crossfade, false after', async () => {
			const { player, mock } = setup();
			const states: boolean[] = [];

			(mock.crossfade as ReturnType<typeof vi.fn>).mockImplementation(() => {
				states.push(player.isTransitioning());
				return Promise.resolve();
			});

			await player.crossfadeTo(makeTrack());

			expect(states).toEqual([true]);
			expect(player.isTransitioning()).toBe(false);
		});
	});

	describe('stacked call rejection', () => {
		it('second simultaneous call returns without starting a second crossfade', async () => {
			const { player, mock } = setup();

			let crossfadeCallCount = 0;
			let resolveFirst!: () => void;
			(mock.crossfade as ReturnType<typeof vi.fn>).mockImplementation(
				() => new Promise<void>((res) => { crossfadeCallCount++; resolveFirst = res; }),
			);

			// Start first — don't await yet.
			const first = player.crossfadeTo(makeTrack('http://test/a.mp3'));

			// Drain microtasks so loadSecondary + primeSecondary resolve and the
			// first crossfade() call is in flight before we run the second call.
			await Promise.resolve();
			await Promise.resolve();
			await Promise.resolve();

			// Attempt a second while the first is mid-crossfade — should be a no-op.
			await player.crossfadeTo(makeTrack('http://test/b.mp3'));

			// Only the first crossfade was actually started.
			expect(crossfadeCallCount).toBe(1);
			// loadSecondary was called exactly once (for track a).
			expect(mock.loadSecondary).toHaveBeenCalledTimes(1);
			expect(mock.loadSecondary).toHaveBeenCalledWith('http://test/a.mp3');

			// Resolve and clean up.
			resolveFirst();
			await first;
		});
	});

	describe('backend delegation', () => {
		it('calls loadSecondary with the track URL', async () => {
			const { player, mock } = setup();
			const track = makeTrack('http://test/next.mp3');

			await player.crossfadeTo(track);

			expect(mock.loadSecondary).toHaveBeenCalledWith('http://test/next.mp3');
		});

		it('calls primeSecondary with startAt when provided', async () => {
			const { player, mock } = setup();

			await player.crossfadeTo(makeTrack(), { duration: 2, startAt: 500 });

			expect(mock.primeSecondary).toHaveBeenCalledWith(500);
		});

		it('calls primeSecondary with undefined when startAt is omitted', async () => {
			const { player, mock } = setup();

			await player.crossfadeTo(makeTrack(), { duration: 2 });

			expect(mock.primeSecondary).toHaveBeenCalledWith(undefined);
		});

		it('calls crossfade with duration converted to milliseconds', async () => {
			const { player, mock } = setup();

			await player.crossfadeTo(makeTrack(), { duration: 3 });

			expect(mock.crossfade).toHaveBeenCalledWith(3000);
		});

		it('uses crossfadeDefaults.duration when no per-call duration is given', async () => {
			const div = document.createElement('div');
			div.id = 'xfade-defaults';
			document.body.appendChild(div);

			const player = new NMMusicPlayer('xfade-defaults');
			player.setup({ crossfadeDefaults: { duration: 7 } });

			const mock = makeMockBackend();
			(player as any)._backend = mock;

			await player.crossfadeTo(makeTrack());

			expect(mock.crossfade).toHaveBeenCalledWith(7000);
		});
	});

	describe('missing URL guard', () => {
		it('throws MediaFormatError when track.url is absent', async () => {
			const { player } = setup();
			const trackNoUrl = { id: '2', name: 'No URL' } as MusicPlaylistItem;

			await expect(player.crossfadeTo(trackNoUrl)).rejects.toThrow();
		});
	});
});
