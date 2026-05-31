export { autoAdvancePlugin, AutoAdvancePlugin } from './auto-advance';
export type { AutoAdvanceOptions } from './auto-advance';

export { castSenderPlugin, CastSenderPlugin } from './cast-sender';
export type { CastSenderEvents, CastSenderOptions } from './cast-sender';

export { drmPlugin, DrmPlugin } from './drm';
export type { DrmEvents, DrmOptions } from './drm';

export { embedPlugin, EmbedPlugin } from './embed';
export type { EmbedCommand, EmbedEventMessage, EmbedForwardedEvent, EmbedOptions, EmbedSerializedError } from './embed';

export { groupListeningPlugin, GroupListeningPlugin } from './group-listening';
export type { GroupListeningEvents, GroupListeningOptions } from './group-listening';
// Cross-library plugins (from core, with music-specific defaults where applicable)
export { keyHandlerPlugin, KeyHandlerPlugin } from './key-handler';
// Heavy orchestration plugins — server coordination, sync, DRM, cast handoff
export { liveTranscodingPlugin, LiveTranscodingPlugin } from './live-transcoding';
export type { LiveTranscodingEvents, LiveTranscodingOptions } from './live-transcoding';
export { lyricsPlugin, LyricsPlugin } from './lyrics';
export type { LyricsEvents, LyricsOptions } from './lyrics';
export { mediaSessionPlugin, MediaSessionPlugin } from './media-session';
export { messagePlugin, MessagePlugin } from './message';
export type { MessageOptions } from './message';
// Music-specific plugins
export { musicUiPlugin, MusicUiPlugin } from './music-ui';
export type { MusicUiEvents, MusicUiOptions } from './music-ui';
export { tabLeaderPlugin, TabLeaderPlugin } from './tab-leader';
export type { TabLeaderOptions } from './tab-leader';
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
