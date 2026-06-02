export { autoAdvancePlugin, AutoAdvancePlugin } from './auto-advance';
export type { AutoAdvanceOptions } from './auto-advance';

export { drmPlugin, DrmPlugin } from './drm';
export type { DrmEvents, DrmOptions } from './drm';

export { groupListeningPlugin, GroupListeningPlugin } from './group-listening';
export type { GroupListeningEvents, GroupListeningOptions } from './group-listening';

export { liveTranscodingPlugin, LiveTranscodingPlugin } from './live-transcoding';
export type { LiveTranscodingEvents, LiveTranscodingOptions } from './live-transcoding';

export { castSenderPlugin, CastSenderPlugin } from './cast-sender';
export type { CastSenderEvents, CastSenderOptions } from './cast-sender';

// Cross-library plugins (from core, with music-specific defaults where applicable)
export { keyHandlerPlugin, KeyHandlerPlugin } from './key-handler';
export { lyricsPlugin, LyricsPlugin } from './lyrics';
export type { LyricsEvents, LyricsOptions } from './lyrics';
export { mediaSessionPlugin, MediaSessionPlugin } from './media-session';
// Music-specific plugins
export { musicUiPlugin, MusicUiPlugin } from './music-ui';
export type { MusicUiEvents, MusicUiOptions } from './music-ui';

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

export { messagePlugin, MessagePlugin } from '@nomercy-entertainment/nomercy-player-core/plugins/message';
export type { MessageInput, MessageOptions } from '@nomercy-entertainment/nomercy-player-core/plugins/message';

export { tabLeaderPlugin, TabLeaderPlugin } from '@nomercy-entertainment/nomercy-player-core/plugins/tab-leader';
export type { TabLeaderEvents, TabLeaderOptions } from '@nomercy-entertainment/nomercy-player-core/plugins/tab-leader';
