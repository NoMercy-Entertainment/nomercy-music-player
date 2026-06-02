import { NotImplementedError, Plugin } from '@nomercy-entertainment/nomercy-player-core';

import type { NMMusicPlayer } from '../../index';

/** Reserved options interface for {@link DrmPlugin} v2.1. Not consumed in v2.0. */
export interface DrmOptions {
	/** EME key system identifier, e.g. `'com.widevine.alpha'`, `'com.apple.fps'`, `'com.microsoft.playready'`. */
	keySystem: string;
	/** License server URL. */
	licenseUrl: string;
	/** Service certificate for FairPlay. Optional for Widevine and PlayReady. */
	certificate?: ArrayBuffer | string;
	/** Request signer for license calls, e.g. HMAC or token injection. */
	customSignRequest?: (request: Request) => Request | Promise<Request>;
	/** License request body transformer. */
	transformLicenseRequest?: (challenge: ArrayBuffer) => ArrayBuffer | Promise<ArrayBuffer>;
	/** License response body transformer. */
	transformLicenseResponse?: (response: ArrayBuffer) => ArrayBuffer | Promise<ArrayBuffer>;
}

/** Reserved events interface for {@link DrmPlugin} v2.1. No events fire in v2.0. */
export interface DrmEvents {
	'key:requested': { sessionId: string; initData: ArrayBuffer };
	'key:granted': { sessionId: string };
	'key:expired': { sessionId: string };
	'key:revoked': { sessionId: string };
	'key:error': { sessionId: string; error: Error };
	'output:restricted': { reason: string };
	unsupported: { reason: string };
}

/**
 * Forward-reserved stub for EME-based DRM support.
 * `use()` throws {@link NotImplementedError} internally; the core catches it,
 * calls `dispose()`, and emits `plugin:failed` on the player.
 * No exception surfaces to caller code.
 * Full implementation ships in v2.1.
 *
 * Plugin id: `'music-drm'`
 */
export class DrmPlugin extends Plugin<NMMusicPlayer, DrmOptions> {
	static override readonly id: string = 'music-drm';
	static override readonly version: string = '2.0.0';
	static override readonly description: string = 'EME-based DRM for music streams — roadmapped for v2.1';

	override use(): void {
		throw new NotImplementedError(
			'DrmPlugin: roadmapped for v2.1. Not available in v2.0.',
			'music-drm',
		);
	}

	override dispose(): void {
		// No-op: stub has no resources to release.
	}
}

/** Plugin alias for {@link DrmPlugin}. Pass to `addPlugin(drmPlugin)`. */
export const drmPlugin = DrmPlugin;
