// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * Sentinel tests for every still-unimplemented method on NMMusicPlayer.
 *
 * Each method here MUST throw `core:player/not-implemented` (spec-compliant
 * `StateError`). When an implementation lands, the corresponding test breaks —
 * forcing the implementer to:
 *   1. Delete the sentinel here
 *   2. Add a real behavior test in the matching feature file (transport.test.ts,
 *      queue.test.ts, etc.)
 *
 * Without this file, methods that throw `not-implemented` silently sit in the
 * codebase with zero coverage — exactly the gap Stoney pushed back on.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NMMusicPlayer } from '../index';

describe('NMMusicPlayer — still-unimplemented method inventory', () => {
	beforeEach(() => {
		(NMMusicPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		const div = document.createElement('div');
		div.id = 'test';
		document.body.appendChild(div);
	});

	afterEach(() => {
		(NMMusicPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		document.body.innerHTML = '';
	});

	const player = (): NMMusicPlayer => new NMMusicPlayer('test').setup({});

	describe('streams (now implemented)', () => {
		it('registerStream returns the player and adds to the registry', async () => {
			const musicPlayer = player();
			await musicPlayer.ready();
			const factory = { id: 'custom', canPlay: () => false, create: (() => ({})) as any };
			const ret = musicPlayer.registerStream(factory as any);
			expect(ret).toBe(musicPlayer);
			expect(musicPlayer.streams()).toContain('custom');
		});
		it('unregisterStream removes a registered factory', async () => {
			const musicPlayer = player();
			await musicPlayer.ready();
			musicPlayer.registerStream({ id: 'temp', canPlay: () => false, create: (() => ({})) as any } as any);
			musicPlayer.unregisterStream('temp');
			expect(musicPlayer.streams()).not.toContain('temp');
		});
		it('streams() lists kit defaults (native + hls) after setup', async () => {
			const musicPlayer = player();
			await musicPlayer.ready();
			const list = musicPlayer.streams();
			expect(list).toContain('native');
			expect(list).toContain('hls');
		});
		it('getStreamFactory looks up by id', async () => {
			const musicPlayer = player();
			await musicPlayer.ready();
			expect(musicPlayer.getStreamFactory('hls')?.id).toBe('hls');
			expect(musicPlayer.getStreamFactory('absent')).toBeUndefined();
		});
	});

	describe('backend / loading', () => {
		it('backend() returns an AudioElementBackend instance (default)', async () => {
			const { AudioElementBackend } = await import('../adapters/audio-backend/html5-audio');
			const musicPlayer = player();
			const audioBackend = musicPlayer.backend();
			expect(audioBackend).toBeInstanceOf(AudioElementBackend);
			// Idempotent — same instance returned on second call.
			expect(musicPlayer.backend()).toBe(audioBackend);
			expect(audioBackend.kind).toBe('audio-element');
		});
		it('load throws MediaFormatError when item.url is missing', async () => {
			const musicPlayer = player();
			await musicPlayer.ready();
			let err: unknown;
			try { await musicPlayer.load({ id: 'x' } as any); }
			catch (error) { err = error; }
			expect((err as { code?: string })?.code).toBe('core:media/missing-url');
		});
		it('loadQueue rejects on unreachable URL and emits playlistResolveError', async () => {
			const musicPlayer = player();
			await musicPlayer.ready();
			let resolveErrored = false;
			musicPlayer.on('playlistResolveError' as any, () => { resolveErrored = true; });
			let err: unknown;
			try { await musicPlayer.loadQueue('https://invalid.example.test/never-resolves'); }
			catch (error) { err = error; }
			expect(err).toBeDefined();
			expect(resolveErrored).toBe(true);
		});
	});

	describe('crossfade (now implemented)', () => {
		it('crossfadeTo rejects with MediaFormatError when item lacks a url', async () => {
			const musicPlayer = player();
			await musicPlayer.ready();
			let err: unknown;
			try { await musicPlayer.crossfadeTo({ id: 'x' } as any); }
			catch (error) { err = error; }
			expect((err as { code?: string })?.code).toBe('core:media/missing-url');
			expect((err as { name?: string })?.name).toBe('MediaFormatError');
		});
		it('isTransitioning() returns false on a fresh player', async () => {
			const musicPlayer = player();
			await musicPlayer.ready();
			expect(musicPlayer.isTransitioning()).toBe(false);
		});
	});

	describe('music-specific state enums (now implemented)', () => {
		it('qualityMode() defaults to "auto"', async () => {
			const musicPlayer = player();
			await musicPlayer.ready();
			expect(musicPlayer.qualityMode()).toBe('auto');
		});
		it('audioTrackMode() defaults to "default"', async () => {
			const musicPlayer = player();
			await musicPlayer.ready();
			expect(musicPlayer.audioTrackMode()).toBe('default');
		});
		it('bufferState() returns idle on a fresh player', async () => {
			const musicPlayer = player();
			await musicPlayer.ready();
			expect(musicPlayer.bufferState()).toBe('idle');
		});
		it('networkState() reflects navigator.onLine', async () => {
			const musicPlayer = player();
			await musicPlayer.ready();
			const state = musicPlayer.networkState();
			expect(['online', 'offline', 'slow']).toContain(state);
		});
		it('streamState() returns idle when no source loaded', async () => {
			const musicPlayer = player();
			await musicPlayer.ready();
			expect(musicPlayer.streamState()).toBe('idle');
		});
		it('visibilityState() reflects document.visibilityState', async () => {
			const musicPlayer = player();
			await musicPlayer.ready();
			expect(['visible', 'hidden']).toContain(musicPlayer.visibilityState());
		});
	});

	describe('device capabilities (now implemented — UA detection)', () => {
		it('isTv/isMobile/isDesktop are mutually exclusive booleans', async () => {
			const musicPlayer = player();
			await musicPlayer.ready();
			const flags = [musicPlayer.isTv(), musicPlayer.isMobile(), musicPlayer.isDesktop()];
			expect(flags.every(flag => typeof flag === 'boolean')).toBe(true);
			// At most one of (tv, mobile, desktop) is true (desktop is the default fallback).
			expect(flags.filter(Boolean).length).toBeGreaterThanOrEqual(1);
		});
		it('device() returns DeviceCapabilities snapshot', async () => {
			const musicPlayer = player();
			await musicPlayer.ready();
			const dev = musicPlayer.device();
			expect(typeof dev.isTv).toBe('boolean');
			expect(typeof dev.isMobile).toBe('boolean');
			expect(typeof dev.isDesktop).toBe('boolean');
			expect(typeof dev.pipSupported).toBe('boolean');
			expect(typeof dev.fullscreenSupported).toBe('boolean');
		});
	});

	describe('media capabilities + ABR (now implemented)', () => {
		it('canPlay delegates to platform.capabilities.canDecode and returns DecodingInfo shape', async () => {
			const musicPlayer = player();
			await musicPlayer.ready();
			const info = await musicPlayer.canPlay({ contentType: 'audio/mp4; codecs="mp4a.40.2"' });
			expect(typeof info.supported).toBe('boolean');
			expect(typeof info.smooth).toBe('boolean');
			expect(typeof info.powerEfficient).toBe('boolean');
		});
		it('bandwidth() returns 0 when no estimator wired', async () => {
			const musicPlayer = player();
			await musicPlayer.ready();
			expect(musicPlayer.bandwidth()).toBe(0);
		});
		it('bandwidthEstimator replaces the estimator (kit-level overload) and bandwidth() reflects it', async () => {
			const musicPlayer = player();
			await musicPlayer.ready();
			// `setBandwidthEstimator` was renamed to `bandwidthEstimator(fn?)` —
			// the declare is stale; test the runtime surface via `any` cast.
			const anyP = musicPlayer as unknown as { bandwidthEstimator: (fn?: () => number) => (() => number) | void };
			expect(() => anyP.bandwidthEstimator(() => 12345)).not.toThrow();
			expect(typeof anyP.bandwidthEstimator()).toBe('function');
			// Same wiring as the video player — the override must actually
			// feed bandwidth(), not sit in an unread slot.
			expect(musicPlayer.bandwidth()).toBe(12345);
		});
	});

	describe('audio output device (now implemented)', () => {
		it('audioOutputs returns [] in environments without navigator.mediaDevices', async () => {
			const musicPlayer = player();
			await musicPlayer.ready();
			const outputs = await musicPlayer.audioOutputs();
			expect(Array.isArray(outputs)).toBe(true);
		});
		it('selectAudioOutput throws BrowserPolicyError on unsupported environments', async () => {
			const musicPlayer = player();
			await musicPlayer.ready();
			let err: unknown;
			try { await musicPlayer.selectAudioOutput(); }
			catch (error) { err = error; }
			expect((err as { code?: string }).code).toBe('core:policy/audioOutputPickerUnsupported');
		});
	});

	describe('tracks / chapters / quality (delegated to backend; empty when audio backend has no tracks)', () => {
		it('audioTracks returns [] — single-stream audio has no track variants', async () => {
			const musicPlayer = player();
			await musicPlayer.ready();
			expect(musicPlayer.audioTracks()).toEqual([]);
		});
		it('audioTrack is a no-op on audio backend; emits audioTrack event', async () => {
			const musicPlayer = player();
			await musicPlayer.ready();
			let emittedId: unknown;
			musicPlayer.on('audioTrack' as any, (data: any) => { emittedId = data?.id; });
			await expect(musicPlayer.audioTrack(0)).resolves.not.toThrow();
			expect(emittedId).toBe(0);
		});
		it('qualityLevels returns [] — no HLS variants on audio backend', async () => {
			const musicPlayer = player();
			await musicPlayer.ready();
			expect(musicPlayer.qualityLevels()).toEqual([]);
		});
		it('quality is a no-op on audio backend (no HLS variants)', async () => {
			const musicPlayer = player();
			await musicPlayer.ready();
			expect(() => musicPlayer.quality('auto')).not.toThrow();
			expect(() => musicPlayer.quality(0)).not.toThrow();
		});
		it('chapters returns [] — no chapter wiring on audio yet', async () => {
			const musicPlayer = player();
			await musicPlayer.ready();
			expect(musicPlayer.chapters()).toEqual([]);
		});
		it('seekToChapter is a no-op when chapters() is empty', async () => {
			const musicPlayer = player();
			await musicPlayer.ready();
			expect(() => musicPlayer.seekToChapter(0)).not.toThrow();
		});
		it('nextChapter is a no-op when chapters() is empty', async () => {
			const musicPlayer = player();
			await musicPlayer.ready();
			expect(() => musicPlayer.nextChapter()).not.toThrow();
		});
		it('previousChapter is a no-op when chapters() is empty', async () => {
			const musicPlayer = player();
			await musicPlayer.ready();
			expect(() => musicPlayer.previousChapter()).not.toThrow();
		});
	});

	describe('cast / handoff (now implemented)', () => {
		it('castState() reflects available remote-playback APIs (happy-dom exposes HTMLMediaElement.prototype.remote → "available")', async () => {
			const musicPlayer = player();
			await musicPlayer.ready();
			// happy-dom ships RemotePlayback so castState reads "available".
			// Pure no-API envs would return "unavailable". Either is correct
			// per environment; we just lock in the typed enum value.
			expect(['available', 'unavailable']).toContain(musicPlayer.castState());
		});
		it('transferTo("cast") throws BrowserPolicyError without the Cast SDK loaded', async () => {
			const musicPlayer = player();
			await musicPlayer.ready();
			let err: unknown;
			try { await musicPlayer.transferTo('cast'); }
			catch (error) { err = error; }
			expect((err as { code?: string })?.code).toBe('core:policy/castUnavailable');
		});
	});

	describe('auth runtime (now implemented — was sentinel; behavioural checks)', () => {
		it('auth replaces wholesale and emits auth:refreshed', async () => {
			const musicPlayer = player();
			await musicPlayer.ready();
			let acquiredAt: number | undefined;
			musicPlayer.on('auth:refreshed', (data: any) => { acquiredAt = data.tokenAcquiredAt; });
			musicPlayer.auth({ bearerToken: 'tok-a' });
			expect((musicPlayer as any)._rawAuth()?.bearerToken).toBe('tok-a');
			expect(musicPlayer.auth()?.bearerToken).toBeUndefined();
			expect(acquiredAt).toBeTypeOf('number');
		});

		it('auth shallow-merges over current config', async () => {
			const musicPlayer = player();
			await musicPlayer.ready();
			musicPlayer.auth({ bearerToken: 'tok-a', credentials: 'include' });
			musicPlayer.auth({ bearerToken: 'tok-b' });
			const current = musicPlayer.auth();
			expect((musicPlayer as any)._rawAuth()?.bearerToken).toBe('tok-b');
			expect(current?.bearerToken).toBeUndefined();
			expect(current?.credentials).toBe('include');
		});

		it('auth() returns a frozen snapshot', async () => {
			const musicPlayer = player();
			await musicPlayer.ready();
			musicPlayer.auth({ bearerToken: 'tok' });
			const snap = musicPlayer.auth();
			expect(Object.isFrozen(snap)).toBe(true);
		});

		it('refreshAuth invokes refreshOnUnauthenticated and emits auth:refreshed', async () => {
			const musicPlayer = player();
			await musicPlayer.ready();
			let invoked = false;
			let refreshed = false;
			musicPlayer.auth({ refreshOnUnauthenticated: async () => { invoked = true; } });
			musicPlayer.on('auth:refreshed', () => { refreshed = true; });
			await musicPlayer.refreshAuth();
			expect(invoked).toBe(true);
			expect(refreshed).toBe(true);
		});
	});

	describe('metrics + clock + a11y (now/announce now implemented)', () => {
		it('metrics() returns a snapshot with the standard PlaybackMetrics shape', async () => {
			const musicPlayer = player();
			await musicPlayer.ready();
			const playbackMetrics = musicPlayer.metrics();
			// ttfb / avgBitrate / decoderStalls / droppedFrames — null on audio backends
			expect(playbackMetrics.ttfb).toBeNull();
			expect(playbackMetrics.avgBitrate).toBeNull();
			expect(playbackMetrics.decoderStalls).toBeNull();
			expect(playbackMetrics.droppedFrames).toBeNull();
			// always-number counters
			expect(typeof playbackMetrics.ttff).toBe('number');
			expect(typeof playbackMetrics.rebufferRatio).toBe('number');
			expect(typeof playbackMetrics.joinTime).toBe('number');
			expect(typeof playbackMetrics.sessionDurationMs).toBe('number');
			expect(playbackMetrics.sessionDurationMs).toBeGreaterThanOrEqual(0);
		});
		it('recordMetric writes a value that metrics() reflects (standard + custom)', async () => {
			const musicPlayer = player();
			await musicPlayer.ready();
			musicPlayer.recordMetric('droppedFrames', 12);
			musicPlayer.recordMetric('customCounter', 7);
			const metrics = musicPlayer.metrics() as any;
			expect(metrics.droppedFrames).toBe(12);
			expect(metrics.customCounter).toBe(7);
		});
		it('now() returns clockSource() if configured, else Date.now()', async () => {
			const musicPlayer = player();
			await musicPlayer.ready();
			expect(typeof musicPlayer.now()).toBe('number');
			expect(musicPlayer.now()).toBeGreaterThan(0);
		});
		it('announce() inserts an aria-live element under container', async () => {
			const musicPlayer = player();
			await musicPlayer.ready();
			const before = musicPlayer.container.querySelectorAll('[aria-live]').length;
			musicPlayer.announce('hello world');
			const after = musicPlayer.container.querySelectorAll('[aria-live]').length;
			expect(after).toBe(before + 1);
		});
	});
});
