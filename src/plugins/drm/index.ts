import type { NMMusicPlayer } from '../../index';
import type { MusicPlaylistItem } from '../../types';
import { NotImplementedError, Plugin } from '@nomercy-entertainment/nomercy-player-core';

/** Options for the music {@link DrmPlugin}. */
export interface DrmOptions {
	/** EME key system identifier — `'com.widevine.alpha' | 'com.apple.fps' | 'com.microsoft.playready'` etc. */
	keySystem: string;
	/** License server URL. */
	licenseUrl: string;
	/** Service certificate for FairPlay (optional for Widevine/PlayReady). */
	certificate?: ArrayBuffer | string;
	/** Optional request signer for license calls (HMAC etc.). */
	customSignRequest?: (request: Request) => Request | Promise<Request>;
	/** Optional license request body transformer. */
	transformLicenseRequest?: (challenge: ArrayBuffer) => ArrayBuffer | Promise<ArrayBuffer>;
	/** Optional license response body transformer. */
	transformLicenseResponse?: (response: ArrayBuffer) => ArrayBuffer | Promise<ArrayBuffer>;
}

/** Events emitted by the music {@link DrmPlugin}. */
export interface DrmEvents {
	'key:requested': { sessionId: string; initData: ArrayBuffer };
	'key:granted': { sessionId: string };
	'key:expired': { sessionId: string };
	'key:revoked': { sessionId: string };
	'key:error': { sessionId: string; error: Error };
	'output:restricted': { reason: string };
	'unsupported': { reason: string };
}

/**
 * TODO(v2.1): EME (Widevine / FairPlay / PlayReady) license + key system coordination.
 * Shipping as an explicit stub in 2.0.0 so the public surface is reserved and
 * consumers can introspect the error rather than hitting a silent no-op.
 */
export class DrmPlugin<T extends MusicPlaylistItem = MusicPlaylistItem> extends Plugin<NMMusicPlayer<T>, DrmOptions, DrmEvents> {
	static override readonly id: string = 'music-drm';
	static override readonly version: string = '2.0.0';
	static override readonly description: string = 'EME (Widevine / FairPlay / PlayReady) license + key system coordination';

	/**
	 * Stub — throws `NotImplementedError`. DRM key-system coordination is roadmapped for v2.1.
	 *
	 * @throws {NotImplementedError} Always.
	 */
	override use(): void {
		throw new NotImplementedError(
			'DrmPlugin: roadmapped for v2.1. Not available in v2.0.',
			'music-drm',
		);
	}

	override dispose(): void {
		// Nothing to tear down in the stub.
	}
}

/** Plugin alias for the music {@link DrmPlugin}. Pass to `addPlugin(drmPlugin)`. */
export const drmPlugin = DrmPlugin;
