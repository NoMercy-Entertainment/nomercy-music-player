// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { BackendState } from './IAudioBackend';
import { HLS_EXT_RE } from '@nomercy-entertainment/nomercy-player-core';

export const isHls = (url: string): boolean => HLS_EXT_RE.test(url);

export function supportsNativeHls(audio: HTMLAudioElement): boolean {
	// Chromium answers 'maybe' for HLS but cannot actually demux it. Trust
	// 'maybe' only where MSE is absent (iOS Safari) — hls.js cannot run there
	// anyway, so native is the only option.
	const can = audio.canPlayType('application/vnd.apple.mpegurl');
	return can === 'probably' || (can === 'maybe' && typeof MediaSource === 'undefined');
}

/**
 * Per-backend hls.js constructor config. Both backends share `xhrSetup`;
 * additional keys are backend-specific and optional.
 */
export interface HlsLoaderConfig {
	xhrSetup?: (xhr: XMLHttpRequest) => void;
	autoStartLoad?: boolean;
	enableWorker?: boolean;
	lowLatencyMode?: boolean;
	enableCEA708Captions?: boolean;
}

export interface HlsHandle {
	destroy: () => void;
	stopLoad: () => void;
	startLoad: (startPosition?: number) => void;
}

interface HlsCtor {
	new (cfg?: HlsLoaderConfig): HlsHandle & {
		loadSource: (url: string) => void;
		attachMedia: (el: HTMLMediaElement) => void;
	};
	isSupported: () => boolean;
}

/**
 * Wire hls.js onto `el` using the provided `hlsConfig`, or fall back to
 * setting `el.src` directly when hls.js is not supported.
 *
 * Returns the hls.js instance when it was created, or `undefined` when the
 * native / non-MSE fallback was applied. The caller stores the returned handle
 * to call `stopLoad` / `startLoad` / `destroy` later.
 *
 * IMPORTANT: each backend passes its own `hlsConfig` — do NOT add defaults or
 * merge config here. The config is backend-owned.
 */
export function attachHlsOrFallback(
	HlsModule: unknown,
	el: HTMLMediaElement,
	url: string,
	authParam: string | undefined,
	hlsConfig: HlsLoaderConfig,
	appendAuthTokenParam: (url: string, token: string | undefined) => string,
): HlsHandle | undefined {
	const Hls = HlsModule as HlsCtor;
	if (!Hls.isSupported()) {
		el.src = appendAuthTokenParam(url, authParam);
		(el as HTMLAudioElement).load?.();
		return undefined;
	}
	const hls = new Hls(hlsConfig);
	hls.attachMedia(el);
	hls.loadSource(url);
	return hls;
}

export type DomBridgeHandler = { event: string; handler: EventListener };

/**
 * Attaches the standard set of DOM → backend event bridges and state-mutation
 * handlers onto `el`. Returns the handler array; the caller stores it for
 * later removal via direct `removeEventListener` loops.
 *
 * `emit` receives raw DOM events and forwards them as backend events.
 * `onStateChange` is called for every state transition; the caller writes
 * the value to its own `currentState` field. `getState` is called by the
 * pause handler to guard against resetting an already-idle or error state.
 */
export function attachDomBridgesTo(
	el: HTMLAudioElement,
	emit: (event: string, data: unknown) => void,
	onStateChange: (state: BackendState) => void,
	getState: () => BackendState,
): DomBridgeHandler[] {
	const handlers: DomBridgeHandler[] = [];

	const track = (domEvent: string, handler: EventListener): void => {
		el.addEventListener(domEvent, handler);
		handlers.push({ event: domEvent, handler });
	};

	track('loadstart', ev => emit('loadstart', ev));
	track('loadedmetadata', ev => emit('loadedmetadata', ev));
	track('canplay', ev => emit('canplay', ev));
	track('play', ev => emit('play', ev));
	track('playing', ev => emit('playing', ev));
	track('pause', ev => emit('pause', ev));
	track('ended', ev => emit('ended', ev));
	track('timeupdate', ev => emit('timeupdate', ev));
	track('waiting', ev => emit('waiting', ev));
	track('stalled', ev => emit('stalled', ev));
	track('ratechange', ev => emit('ratechange', ev));
	track('encrypted', ev => emit('encrypted', ev));
	track('error', ev => emit('error', ev));

	// State-mutation handlers tracked in the same array so detachDomBridges
	// and dispose always remove them — no separate cleanup path.
	track('loadstart', () => { onStateChange('loading'); });
	track('loadedmetadata', () => { onStateChange('ready'); });
	track('play', () => { onStateChange('playing'); });
	track('pause', () => {
		if (getState() !== 'idle' && getState() !== 'error') {
			onStateChange('paused');
		}
	});
	track('ended', () => { onStateChange('paused'); });
	track('error', () => { onStateChange('error'); });

	return handlers;
}
