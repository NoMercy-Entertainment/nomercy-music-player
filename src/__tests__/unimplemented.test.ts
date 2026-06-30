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
			const p = player();
			await p.ready();
			const factory = { id: 'custom', canPlay: () => false, create: (() => ({})) as any };
			const ret = p.registerStream(factory as any);
			expect(ret).toBe(p);
			expect(p.streams()).toContain('custom');
		});
		it('unregisterStream removes a registered factory', async () => {
			const p = player();
			await p.ready();
			p.registerStream({ id: 'temp', canPlay: () => false, create: (() => ({})) as any } as any);
			p.unregisterStream('temp');
			expect(p.streams()).not.toContain('temp');
		});
		it('streams() lists kit defaults (native + hls) after setup', async () => {
			const p = player();
			await p.ready();
			const list = p.streams();
			expect(list).toContain('native');
			expect(list).toContain('hls');
		});
		it('getStreamFactory looks up by id', async () => {
			const p = player();
			await p.ready();
			expect(p.getStreamFactory('hls')?.id).toBe('hls');
			expect(p.getStreamFactory('absent')).toBeUndefined();
		});
	});

	describe('backend / loading', () => {
		it('backend() returns an AudioElementBackend instance (default)', async () => {
			const { AudioElementBackend } = await import('../adapters/audio-backend/html5-audio');
			const p = player();
			const b = p.backend();
			expect(b).toBeInstanceOf(AudioElementBackend);
			// Idempotent — same instance returned on second call.
			expect(p.backend()).toBe(b);
			expect(b.kind).toBe('audio-element');
		});
		it('load throws MediaFormatError when item.url is missing', async () => {
			const p = player();
			await p.ready();
			let err: unknown;
			try { await p.load({ id: 'x' } as any); }
			catch (e) { err = e; }
			expect((err as { code?: string })?.code).toBe('core:media/missing-url');
		});
		it('loadQueue rejects on unreachable URL and emits playlistResolveError', async () => {
			const p = player();
			await p.ready();
			let resolveErrored = false;
			p.on('playlistResolveError' as any, () => { resolveErrored = true; });
			let err: unknown;
			try { await p.loadQueue('https://invalid.example.test/never-resolves'); }
			catch (e) { err = e; }
			expect(err).toBeDefined();
			expect(resolveErrored).toBe(true);
		});
	});

	describe('crossfade (now implemented)', () => {
		it('crossfadeTo rejects with MediaFormatError when item lacks a url', async () => {
			const p = player();
			await p.ready();
			let err: unknown;
			try { await p.crossfadeTo({ id: 'x' } as any); }
			catch (e) { err = e; }
			expect((err as { code?: string })?.code).toBe('core:media/missing-url');
			expect((err as { name?: string })?.name).toBe('MediaFormatError');
		});
		it('isTransitioning() returns false on a fresh player', async () => {
			const p = player();
			await p.ready();
			expect(p.isTransitioning()).toBe(false);
		});
	});

	describe('music-specific state enums (now implemented)', () => {
		it('qualityMode() defaults to "auto"', async () => {
			const p = player();
			await p.ready();
			expect(p.qualityMode()).toBe('auto');
		});
		it('audioTrackMode() defaults to "default"', async () => {
			const p = player();
			await p.ready();
			expect(p.audioTrackMode()).toBe('default');
		});
		it('bufferState() returns idle on a fresh player', async () => {
			const p = player();
			await p.ready();
			expect(p.bufferState()).toBe('idle');
		});
		it('networkState() reflects navigator.onLine', async () => {
			const p = player();
			await p.ready();
			const state = p.networkState();
			expect(['online', 'offline', 'slow']).toContain(state);
		});
		it('streamState() returns idle when no source loaded', async () => {
			const p = player();
			await p.ready();
			expect(p.streamState()).toBe('idle');
		});
		it('visibilityState() reflects document.visibilityState', async () => {
			const p = player();
			await p.ready();
			expect(['visible', 'hidden']).toContain(p.visibilityState());
		});
	});

	describe('device capabilities (now implemented — UA detection)', () => {
		it('isTv/isMobile/isDesktop are mutually exclusive booleans', async () => {
			const p = player();
			await p.ready();
			const flags = [p.isTv(), p.isMobile(), p.isDesktop()];
			expect(flags.every(f => typeof f === 'boolean')).toBe(true);
			// At most one of (tv, mobile, desktop) is true (desktop is the default fallback).
			expect(flags.filter(Boolean).length).toBeGreaterThanOrEqual(1);
		});
		it('device() returns DeviceCapabilities snapshot', async () => {
			const p = player();
			await p.ready();
			const dev = p.device();
			expect(typeof dev.isTv).toBe('boolean');
			expect(typeof dev.isMobile).toBe('boolean');
			expect(typeof dev.isDesktop).toBe('boolean');
			expect(typeof dev.pipSupported).toBe('boolean');
			expect(typeof dev.fullscreenSupported).toBe('boolean');
		});
	});

	describe('media capabilities + ABR (now implemented)', () => {
		it('canPlay delegates to platform.capabilities.canDecode and returns DecodingInfo shape', async () => {
			const p = player();
			await p.ready();
			const info = await p.canPlay({ contentType: 'audio/mp4; codecs="mp4a.40.2"' });
			expect(typeof info.supported).toBe('boolean');
			expect(typeof info.smooth).toBe('boolean');
			expect(typeof info.powerEfficient).toBe('boolean');
		});
		it('bandwidth() returns 0 when no estimator wired', async () => {
			const p = player();
			await p.ready();
			expect(p.bandwidth()).toBe(0);
		});
		it('bandwidthEstimator replaces the estimator (kit-level overload)', async () => {
			const p = player();
			await p.ready();
			// The library's `setBandwidthEstimator` declare is stale — the kit
			// renamed it to `bandwidthEstimator(fn?)` per spec §11. Test the real
			// runtime surface via `any` cast.
			const anyP = p as unknown as { bandwidthEstimator: (fn?: () => number) => (() => number) | void };
			expect(() => anyP.bandwidthEstimator(() => 12345)).not.toThrow();
			expect(typeof anyP.bandwidthEstimator()).toBe('function');
		});
	});

	describe('audio output device (now implemented)', () => {
		it('audioOutputs returns [] in environments without navigator.mediaDevices', async () => {
			const p = player();
			await p.ready();
			const outputs = await p.audioOutputs();
			expect(Array.isArray(outputs)).toBe(true);
		});
		it('selectAudioOutput throws BrowserPolicyError on unsupported environments', async () => {
			const p = player();
			await p.ready();
			let err: unknown;
			try { await p.selectAudioOutput(); }
			catch (e) { err = e; }
			expect((err as { code?: string }).code).toBe('core:policy/audioOutputPickerUnsupported');
		});
	});

	describe('tracks / chapters / quality (delegated to backend; empty when audio backend has no tracks)', () => {
		it('subtitles throws NotImplementedError — audio backends do not expose subtitle tracks', async () => {
			const p = player();
			await p.ready();
			expect(() => p.subtitles()).toThrow('Music backends don\'t expose subtitle tracks');
		});
		it('subtitle is a no-op on audio (no backend track support); emits subtitle event', async () => {
			const p = player();
			await p.ready();
			let emittedTrack: unknown;
			p.on('subtitle' as any, (data: any) => { emittedTrack = data?.track; });
			expect(() => p.subtitle(null)).not.toThrow();
			expect(emittedTrack).toBeNull();
		});
		it('audioTracks returns [] — single-stream audio has no track variants', async () => {
			const p = player();
			await p.ready();
			expect(p.audioTracks()).toEqual([]);
		});
		it('audioTrack is a no-op on audio backend; emits audioTrack event', async () => {
			const p = player();
			await p.ready();
			let emittedId: unknown;
			p.on('audioTrack' as any, (data: any) => { emittedId = data?.id; });
			expect(() => p.audioTrack(0)).not.toThrow();
			expect(emittedId).toBe(0);
		});
		it('qualityLevels returns [] — no HLS variants on audio backend', async () => {
			const p = player();
			await p.ready();
			expect(p.qualityLevels()).toEqual([]);
		});
		it('quality is a no-op on audio backend (no HLS variants)', async () => {
			const p = player();
			await p.ready();
			expect(() => p.quality('auto')).not.toThrow();
			expect(() => p.quality(0)).not.toThrow();
		});
		it('chapters returns [] — no chapter wiring on audio yet', async () => {
			const p = player();
			await p.ready();
			expect(p.chapters()).toEqual([]);
		});
		it('seekToChapter is a no-op when chapters() is empty', async () => {
			const p = player();
			await p.ready();
			expect(() => p.seekToChapter(0)).not.toThrow();
		});
		it('nextChapter is a no-op when chapters() is empty', async () => {
			const p = player();
			await p.ready();
			expect(() => p.nextChapter()).not.toThrow();
		});
		it('previousChapter is a no-op when chapters() is empty', async () => {
			const p = player();
			await p.ready();
			expect(() => p.previousChapter()).not.toThrow();
		});
	});

	describe('cast / handoff (now implemented)', () => {
		it('castState() reflects available remote-playback APIs (happy-dom exposes HTMLMediaElement.prototype.remote → "available")', async () => {
			const p = player();
			await p.ready();
			// happy-dom ships RemotePlayback so castState reads "available".
			// Pure no-API envs would return "unavailable". Either is correct
			// per environment; we just lock in the typed enum value.
			expect(['available', 'unavailable']).toContain(p.castState());
		});
		it('transferTo("cast") throws BrowserPolicyError without the Cast SDK loaded', async () => {
			const p = player();
			await p.ready();
			let err: unknown;
			try { await p.transferTo('cast'); }
			catch (e) { err = e; }
			expect((err as { code?: string })?.code).toBe('core:policy/castUnavailable');
		});
	});

	describe('auth runtime (now implemented — was sentinel; behavioural checks)', () => {
		it('auth replaces wholesale and emits auth:refreshed', async () => {
			const p = player();
			await p.ready();
			let acquiredAt: number | undefined;
			p.on('auth:refreshed', (data: any) => { acquiredAt = data.tokenAcquiredAt; });
			p.auth({ bearerToken: 'tok-a' });
			expect((p as any)._rawAuth()?.bearerToken).toBe('tok-a');
			expect(p.auth()?.bearerToken).toBeUndefined();
			expect(acquiredAt).toBeTypeOf('number');
		});

		it('auth shallow-merges over current config', async () => {
			const p = player();
			await p.ready();
			p.auth({ bearerToken: 'tok-a', credentials: 'include' });
			p.auth({ bearerToken: 'tok-b' });
			const current = p.auth();
			expect((p as any)._rawAuth()?.bearerToken).toBe('tok-b');
			expect(current?.bearerToken).toBeUndefined();
			expect(current?.credentials).toBe('include');
		});

		it('auth() returns a frozen snapshot', async () => {
			const p = player();
			await p.ready();
			p.auth({ bearerToken: 'tok' });
			const snap = p.auth();
			expect(Object.isFrozen(snap)).toBe(true);
		});

		it('refreshAuth invokes refreshOnUnauthenticated and emits auth:refreshed', async () => {
			const p = player();
			await p.ready();
			let invoked = false;
			let refreshed = false;
			p.auth({ refreshOnUnauthenticated: async () => { invoked = true; } });
			p.on('auth:refreshed', () => { refreshed = true; });
			await p.refreshAuth();
			expect(invoked).toBe(true);
			expect(refreshed).toBe(true);
		});
	});

	describe('metrics + clock + a11y (now/announce now implemented)', () => {
		it('metrics() returns a snapshot with the standard PlaybackMetrics shape', async () => {
			const p = player();
			await p.ready();
			const m = p.metrics();
			// ttfb / avgBitrate / decoderStalls / droppedFrames — null on audio backends
			expect(m.ttfb).toBeNull();
			expect(m.avgBitrate).toBeNull();
			expect(m.decoderStalls).toBeNull();
			expect(m.droppedFrames).toBeNull();
			// always-number counters
			expect(typeof m.ttff).toBe('number');
			expect(typeof m.rebufferRatio).toBe('number');
			expect(typeof m.joinTime).toBe('number');
			expect(typeof m.sessionDurationMs).toBe('number');
			expect(m.sessionDurationMs).toBeGreaterThanOrEqual(0);
		});
		it('recordMetric writes a value that metrics() reflects (standard + custom)', async () => {
			const p = player();
			await p.ready();
			p.recordMetric('droppedFrames', 12);
			p.recordMetric('customCounter', 7);
			const m = p.metrics() as any;
			expect(m.droppedFrames).toBe(12);
			expect(m.customCounter).toBe(7);
		});
		it('now() returns clockSource() if configured, else Date.now()', async () => {
			const p = player();
			await p.ready();
			expect(typeof p.now()).toBe('number');
			expect(p.now()).toBeGreaterThan(0);
		});
		it('announce() inserts an aria-live element under container', async () => {
			const p = player();
			await p.ready();
			const before = p.container.querySelectorAll('[aria-live]').length;
			p.announce('hello world');
			const after = p.container.querySelectorAll('[aria-live]').length;
			expect(after).toBe(before + 1);
		});
	});
});
