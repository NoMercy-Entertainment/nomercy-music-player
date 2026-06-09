import type { NMMusicPlayer } from '../../index';

import { NotImplementedError, Plugin } from '@nomercy-entertainment/nomercy-player-core';

/** Reserved options interface for {@link LiveTranscodingPlugin} v2.1. Not consumed in v2.0. */
export interface LiveTranscodingOptions {
	/** Server endpoint that owns the transcoding job lifecycle. */
	wsUrl: string;
	/** Optional polling fallback for environments without WebSocket support. */
	pollIntervalMs?: number;
	/** Seconds of buffer that must exist beyond `time` before resuming. */
	resumeAheadSeconds?: number;
	/** When seeking, maximum milliseconds to wait for the transcoder to reach the target position. */
	seekTimeoutMs?: number;
}

/** Reserved events interface for {@link LiveTranscodingPlugin} v2.1. No events fire in v2.0. */
export interface LiveTranscodingEvents {
	'job:started': { jobId: string };
	'job:progress': { jobId: string; bufferedSeconds: number };
	'job:ready-to-play': { jobId: string };
	'job:error': { jobId: string; error: Error };
	'job:complete': { jobId: string };
	'segment:ready': { segmentUrl: string; durationSeconds: number };
	'unsupported': { reason: string };
}

/**
 * Forward-reserved stub for server-coordinated live transcoding in the music player.
 * `use()` throws {@link NotImplementedError} internally; the core catches it,
 * calls `dispose()`, and emits `plugin:failed` and `plugin:live-transcoding:failed`.
 * No exception surfaces to caller code.
 * Full implementation ships in v2.1.
 *
 * Plugin id: `'live-transcoding'`
 */
export class LiveTranscodingPlugin extends Plugin<NMMusicPlayer, LiveTranscodingOptions> {
	static override readonly id: string = 'live-transcoding';
	static override readonly version: string = '2.0.0';
	static override readonly description: string = 'Server-side live transcoding — roadmapped for v2.1';

	override use(): void {
		throw new NotImplementedError(
			'LiveTranscodingPlugin: roadmapped for v2.1. Not available in v2.0.',
			'live-transcoding',
		);
	}

	override dispose(): void {
		// No-op: stub has no resources to release.
	}
}

/** Plugin alias for {@link LiveTranscodingPlugin}. Pass to `addPlugin(liveTranscodingPlugin)`. */
export const liveTranscodingPlugin = LiveTranscodingPlugin;
