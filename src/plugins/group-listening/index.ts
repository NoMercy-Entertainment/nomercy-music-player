import type { NMMusicPlayer } from '../../index';
import { NotImplementedError, Plugin } from '@nomercy-entertainment/nomercy-player-core';

/** Options for {@link GroupListeningPlugin}. */
export interface GroupListeningOptions {
	/** Server endpoint for room/session sync. */
	wsUrl: string;
	/** Optional room / session id this client joins. */
	sessionId?: string;
	/** Acceptable drift in milliseconds before correcting. Default 80ms. */
	driftThresholdMs?: number;
	/** Max playbackRate adjustment factor when correcting drift. Default 0.05 (±5%). */
	maxRateAdjust?: number;
	/** Whether this client can issue control actions (DJ role). Default true. */
	canControl?: boolean;
}

/** Events emitted by {@link GroupListeningPlugin}. */
export interface GroupListeningEvents {
	'session:joined': { sessionId: string; participants: number };
	'session:left': void;
	'sync:applied': { source: 'remote'; action: 'play' | 'pause' | 'seek' | 'next' | 'previous'; from: string };
	'sync:broadcast': { action: string; payload: unknown };
	'sync:drift': { deltaMs: number };
	'sync:participants': { count: number };
	'role:dj-acquired': { id: string };
	'role:dj-lost': void;
	'unsupported': { reason: string };
}

/**
 * TODO(v2.1): full implementation — server protocol, clock correction, DJ-role election.
 * Shipping as an explicit stub in 2.0.0 so the public surface is reserved and
 * consumers can introspect the error rather than hitting a silent no-op.
 */
export class GroupListeningPlugin extends Plugin<NMMusicPlayer<any>, GroupListeningOptions, GroupListeningEvents> {
	static override readonly id: string = 'group-listening';
	static override readonly version: string = '2.0.0';
	static override readonly description: string = 'Synchronised group listening — server-coordinated lockstep transport';

	/**
	 * Stub — throws `NotImplementedError`. Group listening is roadmapped for v2.1.
	 *
	 * @throws {NotImplementedError} Always.
	 */
	override use(): void {
		throw new NotImplementedError(
			'GroupListeningPlugin: roadmapped for v2.1. Not available in v2.0.',
			'group-listening',
		);
	}

	override dispose(): void {
		// Nothing to tear down in the stub.
	}
}

/** Plugin alias for {@link GroupListeningPlugin}. Pass to `addPlugin(groupListeningPlugin)`. */
export const groupListeningPlugin = GroupListeningPlugin;
