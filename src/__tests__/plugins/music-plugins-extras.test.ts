/**
 * Tests for the remaining music v2 plugin stubs — keyHandler/mediaSession
 * subclassing, castSender / drm graceful-degrade, groupListening +
 * liveTranscoding websocket wiring.
 *
 * These plugins all need to load and dispose cleanly on a JSDOM machine
 * with no Cast SDK, no EME, and no real WebSocket server. The tests pin
 * the guard paths so a regression in any plugin's `use()` / `dispose()`
 * never silently leaks listeners or throws.
 */

import { NotImplementedError } from '@nomercy-entertainment/nomercy-player-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NMMusicPlayer } from '../../index';
import { CastSenderPlugin } from '../../plugins/cast-sender';
import { DrmPlugin } from '../../plugins/drm';
import { GroupListeningPlugin } from '../../plugins/group-listening';
import { KeyHandlerPlugin } from '../../plugins/key-handler';
import { LiveTranscodingPlugin } from '../../plugins/live-transcoding';
import { MediaSessionPlugin } from '../../plugins/media-session';

describe('NMMusicPlayer — remaining plugin stubs', () => {
	beforeEach(() => {
		(NMMusicPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		const div = document.createElement('div');
		div.id = 'extras';
		document.body.appendChild(div);
	});

	afterEach(() => {
		(NMMusicPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		document.body.innerHTML = '';
	});

	const setup = (): NMMusicPlayer => new NMMusicPlayer('extras').setup({});

	describe('keyHandlerPlugin', () => {
		it('inherits kit defaults AND adds music-specific n/p/r/s bindings', async () => {
			const p = setup();
			p.addPlugin(KeyHandlerPlugin);
			await p.ready();
			const instance = p.getPlugin(KeyHandlerPlugin);
			expect(instance).toBeInstanceOf(KeyHandlerPlugin);
			if (!instance)
				throw new Error('KeyHandlerPlugin not registered');
			const bindings = instance.bindings();
			// Kit defaults — must still be present.
			expect(bindings.has(' ')).toBe(true);
			expect(bindings.has('m')).toBe(true);
			expect(bindings.has('ArrowLeft')).toBe(true);
			expect(bindings.has('ArrowRight')).toBe(true);
			expect(bindings.has('ArrowUp')).toBe(true);
			expect(bindings.has('ArrowDown')).toBe(true);
			// Music-specific — added by our subclass.
			expect(bindings.has('n')).toBe(true);
			expect(bindings.has('p')).toBe(true);
			expect(bindings.has('r')).toBe(true);
			expect(bindings.has('s')).toBe(true);
		});
	});

	describe('mediaSessionPlugin', () => {
		it('getMetadata reads music-specific fields off a MusicPlaylistItem', async () => {
			const p = setup();
			p.addPlugin(MediaSessionPlugin);
			await p.ready();
			const instance = p.getPlugin(MediaSessionPlugin);
			const meta = (instance as unknown as { getMetadata: (item: any) => any }).getMetadata({
				id: 'a',
				name: 'Track A',
				cover: 'https://example.com/a.jpg',
				artist_track: [{ id: 1, name: 'Artist One' }, { id: 2, name: 'Artist Two' }],
				album_track: [{ id: 9, name: 'Album X' }],
			});
			expect(meta.title).toBe('Track A');
			expect(meta.artist).toBe('Artist One, Artist Two');
			expect(meta.album).toBe('Album X');
			expect(meta.artwork?.[0]?.src).toBe('https://example.com/a.jpg');
			expect(meta.artwork?.[0]?.sizes).toBe('512x512');
		});
	});

	describe('castSenderPlugin', () => {
		it('isConnected() is false before connect() and connect() throws BrowserPolicyError without Cast SDK', async () => {
			const p = setup();
			p.addPlugin(CastSenderPlugin);
			await p.ready();
			const instance = p.getPlugin(CastSenderPlugin);
			expect(instance).toBeInstanceOf(CastSenderPlugin);
			if (!instance)
				throw new Error('CastSenderPlugin not registered');
			expect(instance.isConnected()).toBe(false);
			await expect(instance.connect()).rejects.toMatchObject({
				name: 'BrowserPolicyError',
				code: 'core:policy/castUnavailable',
			});
		});

		it('forwards player current → loadMedia with a properly-shaped MusicTrackMediaMetadata', async () => {
			const loadMedia = vi.fn().mockResolvedValue(undefined);
			const requestSession = vi.fn().mockResolvedValue(undefined);
			const sessionStub = { loadMedia, getCastDevice: () => ({ friendlyName: 'Couch' }) };
			class StubRemote {
				isConnected = true;
				isPaused = false;
				isMuted = false;
				currentTime = 0;
				duration = 0;
				volumeLevel = 1;
				mediaInfo: { contentId?: string } | null = null;
			}
			const addEventListener = vi.fn();
			const removeEventListener = vi.fn();
			class StubController {
				addEventListener = addEventListener;
				removeEventListener = removeEventListener;
				playOrPause = vi.fn();
				stop = vi.fn();
				seek = vi.fn();
				setVolumeLevel = vi.fn();
				muteOrUnmute = vi.fn();
				constructor(_remote: StubRemote) {}
			}
			class MediaInfoCtor { constructor(public contentId: string, public contentType: string) {} }
			class LoadRequestCtor { constructor(public media: unknown) {} }
			class MusicTrackMetaCtor {}
			(globalThis as any).cast = {
				framework: {
					CastContext: { getInstance: () => ({ requestSession, getCurrentSession: () => sessionStub, endCurrentSession: vi.fn() }) },
					RemotePlayer: StubRemote,
					RemotePlayerController: StubController,
					RemotePlayerEventType: {
						IS_CONNECTED_CHANGED: 'isConnectedChanged',
						IS_PAUSED_CHANGED: 'isPausedChanged',
						CURRENT_TIME_CHANGED: 'currentTimeChanged',
						IS_MEDIA_LOADED_CHANGED: 'isMediaLoadedChanged',
						MEDIA_INFO_CHANGED: 'mediaInfoChanged',
						VOLUME_LEVEL_CHANGED: 'volumeLevelChanged',
						IS_MUTED_CHANGED: 'isMutedChanged',
					},
				},
			};
			(globalThis as any).chrome = {
				cast: {
					media: {
						MediaInfo: MediaInfoCtor,
						LoadRequest: LoadRequestCtor,
						MusicTrackMediaMetadata: MusicTrackMetaCtor,
						GenericMediaMetadata: class {},
						StreamType: { BUFFERED: 'BUFFERED', LIVE: 'LIVE' },
					},
				},
			};

			try {
				const p = setup();
				p.addPlugin(CastSenderPlugin);
				await p.ready();
				const instance = p.getPlugin(CastSenderPlugin);
				if (!instance)
					throw new Error('CastSenderPlugin not registered');

				// Stub player.current() to return a track.
				const trackItem = {
					id: 't1',
					name: 'Song A',
					url: 'https://cdn/song-a.mp3',
					cover: 'https://cdn/cover.jpg',
					artist_track: [{ id: 1, name: 'Artist X' }],
					album_track: [{ id: 9, name: 'Album Y' }],
				};
				(p as any).current = (): unknown => trackItem;

				await instance.connect();
				expect(instance.isConnected()).toBe(true);

				// Trigger the player → cast forward via a `current` event.
				(p as any).emit('current', { item: trackItem, index: 0 });
				// loadMedia is called inside connect()'s post-step too; await microtasks.
				await new Promise(resolve => setTimeout(resolve, 0));

				expect(loadMedia).toHaveBeenCalled();
				const call = loadMedia.mock.calls[0]?.[0] as { media?: any };
				const media = call?.media;
				expect(media).toBeDefined();
				expect(media.contentId).toBe('https://cdn/song-a.mp3');
				expect(media.contentType).toBe('audio/mpeg');
				expect(media.streamType).toBe('BUFFERED');
				expect(media.metadata).toBeInstanceOf(MusicTrackMetaCtor);
				expect(media.metadata.title).toBe('Song A');
				expect(media.metadata.artist).toBe('Artist X');
				expect(media.metadata.albumName).toBe('Album Y');
				expect(media.metadata.images?.[0]?.url).toBe('https://cdn/cover.jpg');
			}
			finally {
				delete (globalThis as any).cast;
				delete (globalThis as any).chrome;
			}
		});

		it('mirrors receiver IS_PAUSED_CHANGED back as a player pause with {source:cast, silent:true}', async () => {
			const requestSession = vi.fn().mockResolvedValue(undefined);
			const handlers: Record<string, (e: { value: unknown }) => void> = {};
			class StubRemote {
				isConnected = true;
				isPaused = false;
				isMuted = false;
				currentTime = 12.5;
				duration = 0;
				volumeLevel = 1;
				mediaInfo: { contentId?: string } | null = null;
			}
			class StubController {
				addEventListener = (event: string, handler: (e: { value: unknown }) => void): void => {
					handlers[event] = handler;
				};

				removeEventListener = vi.fn();
				playOrPause = vi.fn();
				stop = vi.fn();
				seek = vi.fn();
				setVolumeLevel = vi.fn();
				muteOrUnmute = vi.fn();
				constructor(_remote: StubRemote) {}
			}
			let stubRemoteRef: StubRemote | null = null as StubRemote | null;
			(globalThis as any).cast = {
				framework: {
					CastContext: { getInstance: () => ({ requestSession, getCurrentSession: () => ({ loadMedia: vi.fn().mockResolvedValue(undefined) }), endCurrentSession: vi.fn() }) },
					RemotePlayer: class extends StubRemote { constructor() { super(); stubRemoteRef = this; } },
					RemotePlayerController: StubController,
					RemotePlayerEventType: {
						IS_CONNECTED_CHANGED: 'isConnectedChanged',
						IS_PAUSED_CHANGED: 'isPausedChanged',
						CURRENT_TIME_CHANGED: 'currentTimeChanged',
						IS_MEDIA_LOADED_CHANGED: 'isMediaLoadedChanged',
						MEDIA_INFO_CHANGED: 'mediaInfoChanged',
						VOLUME_LEVEL_CHANGED: 'volumeLevelChanged',
						IS_MUTED_CHANGED: 'isMutedChanged',
					},
				},
			};
			(globalThis as any).chrome = { cast: { media: { MediaInfo: class { constructor() {} }, LoadRequest: class { constructor() {} }, MusicTrackMediaMetadata: class {}, GenericMediaMetadata: class {}, StreamType: { BUFFERED: 'BUFFERED', LIVE: 'LIVE' } } } };

			try {
				const p = setup();
				p.addPlugin(CastSenderPlugin);
				await p.ready();
				const instance = p.getPlugin(CastSenderPlugin);
				if (!instance)
					throw new Error('CastSenderPlugin not registered');
				(p as any).current = (): unknown => undefined;

				await instance.connect();

				const seenPause: any[] = [];
				p.on('pause' as any, (data: any) => { seenPause.push(data); });

				// Receiver flipped to paused — fire IS_PAUSED_CHANGED.
				if (stubRemoteRef)
					(stubRemoteRef as StubRemote).isPaused = true;
				handlers['isPausedChanged']?.({ value: true });

				expect(seenPause.length).toBeGreaterThan(0);
				expect(seenPause[0]).toMatchObject({ source: 'cast', silent: true });
			}
			finally {
				delete (globalThis as any).cast;
				delete (globalThis as any).chrome;
			}
		});
	});

	describe('drmPlugin — v2.0 stub', () => {
		it('emits plugin:failed with NotImplementedError; player still reaches ready', async () => {
			const p = setup();
			const failedErrors: Error[] = [];
			p.on('plugin:failed' as any, (data: any) => { failedErrors.push(data?.error); });
			p.addPlugin(DrmPlugin, { keySystem: 'com.widevine.alpha', licenseUrl: 'https://example.com/license' });
			await p.ready();

			expect(failedErrors).toHaveLength(1);
			expect(failedErrors[0]).toBeInstanceOf(NotImplementedError);
			expect(failedErrors[0]?.message).toMatch('DrmPlugin: roadmapped for v2.1');
		});
	});

	describe('groupListeningPlugin — v2.0 stub', () => {
		it('emits plugin:failed with NotImplementedError; player still reaches ready', async () => {
			const p = setup();
			const failedErrors: Error[] = [];
			p.on('plugin:failed' as any, (data: any) => { failedErrors.push(data?.error); });
			p.addPlugin(GroupListeningPlugin, { wsUrl: 'ws://test/group' });
			await p.ready();

			expect(failedErrors).toHaveLength(1);
			expect(failedErrors[0]).toBeInstanceOf(NotImplementedError);
			expect(failedErrors[0]?.message).toMatch('GroupListeningPlugin: roadmapped for v2.1');
		});
	});

	describe('liveTranscodingPlugin — v2.0 stub', () => {
		it('emits plugin:failed with NotImplementedError; player still reaches ready', async () => {
			const p = setup();
			const failedErrors: Error[] = [];
			p.on('plugin:failed' as any, (data: any) => { failedErrors.push(data?.error); });
			p.addPlugin(LiveTranscodingPlugin, { wsUrl: 'ws://test/live' });
			await p.ready();

			expect(failedErrors).toHaveLength(1);
			expect(failedErrors[0]).toBeInstanceOf(NotImplementedError);
			expect(failedErrors[0]?.message).toMatch('LiveTranscodingPlugin: roadmapped for v2.1');
		});
	});

	// Suppresses unused-import warning for `vi`; kept available for future tests.
	void vi;
});
