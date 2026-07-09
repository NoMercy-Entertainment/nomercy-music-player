// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * Exports-map resolution suite (mirrors the core package's subpath-exports
 * test). Every subpath in package.json#exports is imported through its source
 * counterpart and its documented named exports are asserted to exist — a
 * missing re-export or a broken barrel fails here before it can ship.
 */

import type {
	AudioBackendFactory,
	CrossfadeOptions,
	IMusicPlayer,
	MusicEventMap,
	MusicPlaylistItem,
	TimeState,
} from '../types';
import { describe, expect, it } from 'vitest';
// Raw-text import (vite `?raw`) — the tsconfig rootDir stops at src/, so the
// manifest is read as an asset string rather than a JSON module.
import manifestRaw from '../../package.json?raw';
import { AudioElementBackend, WebAudioBackend } from '../adapters/audio-backend/index';
import { AudioElementBackend as AdaptersAudioElementBackend, WebAudioBackend as AdaptersWebAudioBackend } from '../adapters/index';
import nmplayerDefault, {
	MusicPreloadStrategy,
	NMMusicPlayer,
	nmplayer,
	NotImplementedError,
	V1MusicCompatPlugin,
} from '../index';
import {
	autoAdvancePlugin as directAutoAdvancePlugin,
	AutoAdvancePlugin as DirectAutoAdvancePlugin,
	LinearPlaylistGenerator as DirectLinearPlaylistGenerator,
	SmartShuffleGenerator as DirectSmartShuffleGenerator,
} from '../plugins/auto-advance/index';
import { castSenderPlugin as directCastSenderPlugin, CastSenderPlugin as DirectCastSenderPlugin } from '../plugins/cast-sender/index';
import {
	audioGraphPlugin,
	autoAdvancePlugin,
	AutoAdvancePlugin,
	canvasPlugin,
	castSenderPlugin,
	CastSenderPlugin,
	embedPlugin,
	equalizerPlugin,
	keyHandlerPlugin,
	KeyHandlerPlugin,
	LinearPlaylistGenerator,
	lyricsPlugin,
	LyricsPlugin,
	mediaSessionPlugin,
	MediaSessionPlugin,
	messagePlugin,
	mixerPlugin,
	NoopScrobbler,
	scrobblePlugin,
	ScrobblePlugin,
	SmartShuffleGenerator,
	spectrumPlugin,
	tabLeaderPlugin,
	VisualizationPlugin,
} from '../plugins/index';
import { keyHandlerPlugin as directKeyHandlerPlugin, KeyHandlerPlugin as DirectKeyHandlerPlugin } from '../plugins/key-handler/index';
import { lyricsPlugin as directLyricsPlugin, LyricsPlugin as DirectLyricsPlugin } from '../plugins/lyrics/index';
import { mediaSessionPlugin as directMediaSessionPlugin, MediaSessionPlugin as DirectMediaSessionPlugin } from '../plugins/media-session/index';
import {
	NoopScrobbler as DirectNoopScrobbler,
	scrobblePlugin as directScrobblePlugin,
	ScrobblePlugin as DirectScrobblePlugin,
} from '../plugins/scrobble/index';
import hlsStreamDefault, { hlsFactory } from '../streams/hls';
import nativeStreamDefault, { nativeFactory } from '../streams/native';
import {
	AudioTrackState,
	PlayState,
	QualityState,
	RepeatState,
	ShuffleState,
	VolumeState,
} from '../types';

const EXPECTED_EXPORT_KEYS = [
	'.',
	'./adapters',
	'./adapters/audio-backend',
	'./plugins',
	'./plugins/auto-advance',
	'./plugins/cast-sender',
	'./plugins/key-handler',
	'./plugins/lyrics',
	'./plugins/media-session',
	'./plugins/scrobble',
	'./streams/native',
	'./streams/hls',
	'./types',
	'./package.json',
];

describe('subpath-exports', () => {
	describe('package.json exports map', () => {
		it('declares exactly the documented subpath keys', () => {
			const manifest = JSON.parse(manifestRaw) as { exports: Record<string, unknown> };

			expect(Object.keys(manifest.exports)).toEqual(EXPECTED_EXPORT_KEYS);
		});
	});

	describe('. (main barrel)', () => {
		it('NMMusicPlayer is constructable', () => {
			expect(typeof NMMusicPlayer).toBe('function');
		});

		it('nmplayer factory is the default export', () => {
			expect(typeof nmplayer).toBe('function');
			expect(nmplayerDefault).toBe(nmplayer);
		});

		it('V1MusicCompatPlugin is exported with its stable plugin id', () => {
			expect(typeof V1MusicCompatPlugin).toBe('function');
			expect(V1MusicCompatPlugin.id).toBe('v1-music-compat');
		});

		it('MusicPreloadStrategy is constructable', () => {
			expect(new MusicPreloadStrategy(10)).toBeTruthy();
		});

		it('NotImplementedError is re-exported from the kit', () => {
			expect(typeof NotImplementedError).toBe('function');
		});
	});

	describe('./adapters', () => {
		it('re-exports both audio backends', () => {
			expect(AdaptersAudioElementBackend).toBe(AudioElementBackend);
			expect(AdaptersWebAudioBackend).toBe(WebAudioBackend);
		});
	});

	describe('./adapters/audio-backend', () => {
		it('AudioElementBackend is constructable over a plain container', () => {
			const container = document.createElement('div');
			const backend = new AudioElementBackend(container);
			expect(backend.kind).toBe('audio-element');
			backend.dispose();
		});

		it('WebAudioBackend is exported (construction requires AudioContext)', () => {
			expect(typeof WebAudioBackend).toBe('function');
		});
	});

	describe('./plugins (barrel)', () => {
		it('exposes every music plugin class with its alias', () => {
			expect(autoAdvancePlugin).toBe(AutoAdvancePlugin);
			expect(castSenderPlugin).toBe(CastSenderPlugin);
			expect(keyHandlerPlugin).toBe(KeyHandlerPlugin);
			expect(lyricsPlugin).toBe(LyricsPlugin);
			expect(mediaSessionPlugin).toBe(MediaSessionPlugin);
			expect(scrobblePlugin).toBe(ScrobblePlugin);
		});

		it('exposes the playlist generators', () => {
			expect(new LinearPlaylistGenerator()).toBeTruthy();
			expect(new SmartShuffleGenerator()).toBeTruthy();
		});

		it('exposes NoopScrobbler', () => {
			expect(new NoopScrobbler()).toBeTruthy();
		});

		it('re-exports the kit audio-graph plugin stack', () => {
			expect(typeof audioGraphPlugin).toBe('function');
			expect(typeof canvasPlugin).toBe('function');
			expect(typeof equalizerPlugin).toBe('function');
			expect(typeof mixerPlugin).toBe('function');
			expect(typeof spectrumPlugin).toBe('function');
			expect(typeof VisualizationPlugin).toBe('function');
		});

		it('re-exports the kit embed / message / tab-leader plugins', () => {
			expect(typeof embedPlugin).toBe('function');
			expect(typeof messagePlugin).toBe('function');
			expect(typeof tabLeaderPlugin).toBe('function');
		});
	});

	describe('./plugins/* (direct subpaths)', () => {
		it('./plugins/auto-advance exports match the barrel', () => {
			expect(DirectAutoAdvancePlugin).toBe(AutoAdvancePlugin);
			expect(directAutoAdvancePlugin).toBe(autoAdvancePlugin);
			expect(DirectLinearPlaylistGenerator).toBe(LinearPlaylistGenerator);
			expect(DirectSmartShuffleGenerator).toBe(SmartShuffleGenerator);
		});

		it('./plugins/cast-sender exports match the barrel', () => {
			expect(DirectCastSenderPlugin).toBe(CastSenderPlugin);
			expect(directCastSenderPlugin).toBe(castSenderPlugin);
		});

		it('./plugins/key-handler exports match the barrel', () => {
			expect(DirectKeyHandlerPlugin).toBe(KeyHandlerPlugin);
			expect(directKeyHandlerPlugin).toBe(keyHandlerPlugin);
		});

		it('./plugins/lyrics exports match the barrel', () => {
			expect(DirectLyricsPlugin).toBe(LyricsPlugin);
			expect(directLyricsPlugin).toBe(lyricsPlugin);
		});

		it('./plugins/media-session exports match the barrel', () => {
			expect(DirectMediaSessionPlugin).toBe(MediaSessionPlugin);
			expect(directMediaSessionPlugin).toBe(mediaSessionPlugin);
		});

		it('./plugins/scrobble exports match the barrel', () => {
			expect(DirectScrobblePlugin).toBe(ScrobblePlugin);
			expect(directScrobblePlugin).toBe(scrobblePlugin);
			expect(DirectNoopScrobbler).toBe(NoopScrobbler);
		});
	});

	describe('./streams/*', () => {
		it('./streams/native exports the factory as default and named', () => {
			expect(typeof nativeFactory).toBe('object');
			expect(nativeStreamDefault).toBe(nativeFactory);
		});

		it('./streams/hls exports the factory as default and named', () => {
			expect(typeof hlsFactory).toBe('object');
			expect(hlsStreamDefault).toBe(hlsFactory);
		});
	});

	describe('./types', () => {
		it('exports the state enums', () => {
			expect(PlayState.PLAYING).toBeDefined();
			expect(VolumeState.MUTED).toBeDefined();
			expect(RepeatState.OFF).toBeDefined();
			expect(ShuffleState.ON).toBeDefined();
			expect(AudioTrackState.DEFAULT).toBeDefined();
			expect(QualityState.AUTO).toBeDefined();
		});

		it('type-only exports are importable', () => {
			const item: MusicPlaylistItem | undefined = undefined;
			const eventMap: MusicEventMap | undefined = undefined;
			const musicPlayer: IMusicPlayer | undefined = undefined;
			const crossfadeOptions: CrossfadeOptions | undefined = undefined;
			const backendFactory: AudioBackendFactory | undefined = undefined;
			const timeState: TimeState | undefined = undefined;

			expect(item).toBeUndefined();
			expect(eventMap).toBeUndefined();
			expect(musicPlayer).toBeUndefined();
			expect(crossfadeOptions).toBeUndefined();
			expect(backendFactory).toBeUndefined();
			expect(timeState).toBeUndefined();
		});
	});
});
