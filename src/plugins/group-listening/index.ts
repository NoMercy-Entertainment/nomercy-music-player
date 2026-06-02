import { NotImplementedError, Plugin } from '@nomercy-entertainment/nomercy-player-core';

import type { NMMusicPlayer } from '../../index';

/** Reserved options interface for {@link GroupListeningPlugin} v2.1. Not consumed in v2.0. */
export interface GroupListeningOptions {
	/** WebSocket endpoint for room and session sync. */
	wsUrl: string;
	/** Room or session id this client joins. Omit to create a new session. */
	sessionId?: string;
	/** Acceptable playback drift in milliseconds before a correction is applied. Default `80`. */
	driftThresholdMs?: number;
	/** Maximum playback-rate adjustment factor during drift correction (e.g. 0.05 = ±5%). */
	maxRateAdjust?: number;
	/** Whether this client may issue control actions (hold the DJ role). Default `true`. */
	canControl?: boolean;
}

/** Reserved events interface for {@link GroupListeningPlugin} v2.1. No events fire in v2.0. */
export interface GroupListeningEvents {
	'session:joined': { sessionId: string; participants: number };
	'session:left': void;
	'sync:applied': { source: 'remote'; action: 'play' | 'pause' | 'seek' | 'next' | 'previous'; from: string };
	'sync:broadcast': { action: string; payload: unknown };
	'sync:drift': { deltaMs: number };
	'sync:participants': { count: number };
	'role:dj-acquired': { id: string };
	'role:dj-lost': void;
	unsupported: { reason: string };
}

/**
 * Forward-reserved stub for server-coordinated synchronized multi-client listening
 * (NoMercy Connect watch-party parity for the music player).
 * `use()` throws {@link NotImplementedError} internally; the core catches it,
 * calls `dispose()`, and emits `plugin:failed` and `plugin:group-listening:failed`.
 * No exception surfaces to caller code.
 * Full implementation ships in v2.1.
 *
 * Plugin id: `'group-listening'`
 */
export class GroupListeningPlugin extends Plugin<NMMusicPlayer, GroupListeningOptions> {
	static override readonly id: string = 'group-listening';
	static override readonly version: string = '2.0.0';
	static override readonly description: string = 'Synchronized multi-client listening — roadmapped for v2.1';

	override use(): void {
		throw new NotImplementedError(
			'GroupListeningPlugin: roadmapped for v2.1. Not available in v2.0.',
			'group-listening',
		);
	}

	override dispose(): void {
		// No-op: stub has no resources to release.
	}
}

/** Plugin alias for {@link GroupListeningPlugin}. Pass to `addPlugin(groupListeningPlugin)`. */
export const groupListeningPlugin = GroupListeningPlugin;
