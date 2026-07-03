// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * Tests for `MusicPreloadStrategy.assetsToPreload` — locks artwork resolution
 * onto the cross-library canonical `image` field, with `cover` kept as a
 * back-compat fallback for existing consumers.
 */

import type { MusicPlaylistItem } from '../types';
import { describe, expect, it } from 'vitest';
import { MusicPreloadStrategy } from '../player/preload';

describe('MusicPreloadStrategy — artwork field resolution', () => {
	it('surfaces a poster asset from `image` when only `image` is set', () => {
		const strategy = new MusicPreloadStrategy();
		const item: MusicPlaylistItem = { id: 't1', name: 'Track A', image: 'https://cdn/image.jpg' };

		const assets = strategy.assetsToPreload(item);

		const poster = assets.find(asset => asset.category === 'poster');
		expect(poster).toBeDefined();
		expect(poster!.url).toBe('https://cdn/image.jpg');
	});

	it('still surfaces a poster asset from the deprecated `cover` when `image` is absent', () => {
		const strategy = new MusicPreloadStrategy();
		const item: MusicPlaylistItem = { id: 't2', name: 'Track B', cover: 'https://cdn/cover.jpg' };

		const assets = strategy.assetsToPreload(item);

		const poster = assets.find(asset => asset.category === 'poster');
		expect(poster).toBeDefined();
		expect(poster!.url).toBe('https://cdn/cover.jpg');
	});

	it('prefers `image` over `cover` when both are set', () => {
		const strategy = new MusicPreloadStrategy();
		const item: MusicPlaylistItem = {
			id: 't3',
			name: 'Track C',
			image: 'https://cdn/image.jpg',
			cover: 'https://cdn/cover.jpg',
		};

		const assets = strategy.assetsToPreload(item);

		const poster = assets.find(asset => asset.category === 'poster');
		expect(poster!.url).toBe('https://cdn/image.jpg');
	});

	it('omits the poster asset when neither `image` nor `cover` is set', () => {
		const strategy = new MusicPreloadStrategy();
		const item: MusicPlaylistItem = { id: 't4', name: 'Track D' };

		const assets = strategy.assetsToPreload(item);

		expect(assets.find(asset => asset.category === 'poster')).toBeUndefined();
	});

	it('omits the poster asset when `cover` is explicitly `null`', () => {
		const strategy = new MusicPreloadStrategy();
		const item: MusicPlaylistItem = { id: 't5', name: 'Track E', cover: null };

		const assets = strategy.assetsToPreload(item);

		expect(assets.find(asset => asset.category === 'poster')).toBeUndefined();
	});
});
