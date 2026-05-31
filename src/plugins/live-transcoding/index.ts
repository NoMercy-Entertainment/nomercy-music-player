import type { NMMusicPlayer } from '../../index';
import type { MusicPlaylistItem } from '../../types';
import { NotImplementedError, Plugin } from '@nomercy-entertainment/nomercy-player-core';

/** Options for the music {@link LiveTranscodingPlugin}. */
export interface LiveTranscodingOptions {
	/** Server endpoint that owns the transcoding job lifecycle. */
	wsUrl: string;
	/** Optional polling fallback for environments without WS. */
	pollIntervalMs?: number;
	/** How many seconds of buffer must exist beyond `currentTime` before resuming. */
	resumeAheadSeconds?: number;
	/** When seeking, max milliseconds we'll wait for the transcoder to reach the target. */
	seekTimeoutMs?: number;
}

/** Events emitted by the music {@link LiveTranscodingPlugin}. */
export interface LiveTranscodingEvents {
	'job:started': { jobId: string; sourceUrl: string };
	'job:progress': { jobId: string; transcodedSeconds: number; totalSeconds?: number };
	'job:ready-to-play': { jobId: string };
	'job:error': { jobId: string; error: Error };
	'job:complete': { jobId: string };
}

/**
 * TODO(v2.1): server-coordinated live transcoding — segment-ready gating + loader backpressure.
 * Shipping as an explicit stub in 2.0.0 so the public surface is reserved and
 * consumers can introspect the error rather than hitting a silent no-op.
 */
export class LiveTranscodingPlugin<T extends MusicPlaylistItem = MusicPlaylistItem> extends Plugin<NMMusicPlayer<T>, LiveTranscodingOptions, LiveTranscodingEvents> {
	static override readonly id: string = 'live-transcoding';
	static override readonly version: string = '2.0.0';
	static override readonly description: string = 'Server-coordinated live transcoding — segment-ready gating + loader backpressure';

	/**
	 * Stub — throws `NotImplementedError`. Live transcoding is roadmapped for v2.1.
	 *
	 * @throws {NotImplementedError} Always.
	 */
	override use(): void {
		throw new NotImplementedError(
			'LiveTranscodingPlugin: roadmapped for v2.1. Not available in v2.0.',
			'live-transcoding',
		);
	}

	override dispose(): void {
		// Nothing to tear down in the stub.
	}
}

/** Plugin alias for the music {@link LiveTranscodingPlugin}. Pass to `addPlugin(liveTranscodingPlugin)`. */
export const liveTranscodingPlugin = LiveTranscodingPlugin;
