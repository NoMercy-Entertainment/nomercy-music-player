// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * Each v2.0 forward-reserved stub must:
 *   - throw NotImplementedError from use() with the documented message
 *   - have the correct static id
 *   - have dispose() as a no-op (no throw)
 */

import { NotImplementedError } from '@nomercy-entertainment/nomercy-player-core';
import { describe, expect, it } from 'vitest';
import { DrmPlugin } from '../../plugins/drm';
import { GroupListeningPlugin } from '../../plugins/group-listening';
import { LiveTranscodingPlugin } from '../../plugins/live-transcoding';

describe('DrmPlugin stub', () => {
	it('has static id music-drm', () => {
		expect(DrmPlugin.id).toBe('music-drm');
	});

	it('use() throws NotImplementedError with roadmap message', () => {
		const instance = Object.create(DrmPlugin.prototype) as DrmPlugin;
		expect(() => instance.use()).toThrow(NotImplementedError);
		expect(() => instance.use()).toThrow('DrmPlugin: roadmapped for v2.1. Not available in v2.0.');
	});

	it('dispose() does not throw', () => {
		const instance = Object.create(DrmPlugin.prototype) as DrmPlugin;
		expect(() => instance.dispose()).not.toThrow();
	});
});

describe('GroupListeningPlugin stub', () => {
	it('has static id group-listening', () => {
		expect(GroupListeningPlugin.id).toBe('group-listening');
	});

	it('use() throws NotImplementedError with roadmap message', () => {
		const instance = Object.create(GroupListeningPlugin.prototype) as GroupListeningPlugin;
		expect(() => instance.use()).toThrow(NotImplementedError);
		expect(() => instance.use()).toThrow('GroupListeningPlugin: roadmapped for v2.1. Not available in v2.0.');
	});

	it('dispose() does not throw', () => {
		const instance = Object.create(GroupListeningPlugin.prototype) as GroupListeningPlugin;
		expect(() => instance.dispose()).not.toThrow();
	});
});

describe('LiveTranscodingPlugin stub', () => {
	it('has static id live-transcoding', () => {
		expect(LiveTranscodingPlugin.id).toBe('live-transcoding');
	});

	it('use() throws NotImplementedError with roadmap message', () => {
		const instance = Object.create(LiveTranscodingPlugin.prototype) as LiveTranscodingPlugin;
		expect(() => instance.use()).toThrow(NotImplementedError);
		expect(() => instance.use()).toThrow('LiveTranscodingPlugin: roadmapped for v2.1. Not available in v2.0.');
	});

	it('dispose() does not throw', () => {
		const instance = Object.create(LiveTranscodingPlugin.prototype) as LiveTranscodingPlugin;
		expect(() => instance.dispose()).not.toThrow();
	});
});
