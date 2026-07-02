// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

export {
	autoAdvancePlugin,
	AutoAdvancePlugin,
	LinearPlaylistGenerator,
	SmartShuffleGenerator,
} from './auto-advance';
export type { AutoAdvanceOptions, IPlaylistGenerator } from './auto-advance';

export { castSenderPlugin, CastSenderPlugin } from './cast-sender';
export type { CastSenderEvents, CastSenderOptions } from './cast-sender';

export { keyHandlerPlugin, KeyHandlerPlugin } from './key-handler';

export { lyricsPlugin, LyricsPlugin } from './lyrics';
export type { LyricsEvents, LyricsOptions } from './lyrics';

export { mediaSessionPlugin, MediaSessionPlugin } from './media-session';

export { NoopScrobbler, scrobblePlugin, ScrobblePlugin } from './scrobble';
export type {
	IScrobbler,
	ScrobbleContext,
	ScrobbleEvents,
	ScrobbleOptions,
} from './scrobble';

// Audio-graph plugins re-exported from core for ergonomic imports.
// Layered composition: addPlugin(audioGraphPlugin) → addPlugin(equalizerPlugin / mixerPlugin / spectrumPlugin / canvasPlugin / visualizers).
// All opt-in — none allocate AudioContext / canvas / RAF unless registered.
export {
	audioGraphPlugin,
	AudioGraphPlugin,
	canvasPlugin,
	CanvasPlugin,
	equalizerPlugin,
	EqualizerPlugin,
	mixerPlugin,
	MixerPlugin,
	spectrumPlugin,
	SpectrumPlugin,
	VisualizationPlugin,
} from '@nomercy-entertainment/nomercy-player-core';
export type {
	AudioGraphEvents,
	AudioGraphOptions,
	CanvasEvents,
	CanvasOptions,
	CanvasRenderFn,
	EqBand,
	EqPreset,
	EqualizerEvents,
	EqualizerOptions,
	MixerEvents,
	MixerOptions,
	SpectrumOptions,
	VisualizationFrame,
	VisualizationOptions,
} from '@nomercy-entertainment/nomercy-player-core';

export { embedPlugin, EmbedPlugin } from '@nomercy-entertainment/nomercy-player-core/plugins/embed';
export type {
	EmbedCommand,
	EmbedEventMessage,
	EmbedForwardedEvent,
	EmbedOptions,
	EmbedSerializedError,
} from '@nomercy-entertainment/nomercy-player-core/plugins/embed';

export type { KeyBindings, KeyHandlerOptions } from '@nomercy-entertainment/nomercy-player-core/plugins/key-handler';
export type { MediaSessionMetadata, MediaSessionOptions } from '@nomercy-entertainment/nomercy-player-core/plugins/media-session';

export { messagePlugin, MessagePlugin } from '@nomercy-entertainment/nomercy-player-core/plugins/message';
export type { MessageInput, MessageOptions } from '@nomercy-entertainment/nomercy-player-core/plugins/message';

export { tabLeaderPlugin, TabLeaderPlugin } from '@nomercy-entertainment/nomercy-player-core/plugins/tab-leader';
export type { TabLeaderEvents, TabLeaderOptions } from '@nomercy-entertainment/nomercy-player-core/plugins/tab-leader';
