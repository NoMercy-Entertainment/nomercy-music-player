// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * Real-behavior constructor tests for NMMusicPlayer. Locks the v1-compatible
 * three-form factory contract and the registry pattern.
 *
 * Locked behavior:
 *  - `nmMPlayer()` (no instances) → throws `core:player/no-element`
 *  - `nmMPlayer()` (instances exist) → returns first registered instance
 *  - `nmMPlayer(42)` (no match) → throws `core:player/not-found`
 *  - `nmMPlayer('myDiv')` (new) → mounts to `<div id="myDiv">` + registers
 *  - `nmMPlayer('myDiv')` (existing) → returns the existing instance (idempotent)
 *  - `nmMPlayer('absent')` → throws `core:player/element-missing`
 *  - `nmMPlayer(<non-div>)` → throws `core:player/element-not-div`
 *  - `nmMPlayer(true as any)` → throws `core:player/invalid-id-type`
 *  - `id` getter mirrors `playerId`
 *  - Per-library registry (music ↔ video are independent)
 */

import { PlayerError, ResourceError, StateError } from '@nomercy-entertainment/nomercy-player-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { nmMPlayer, NMMusicPlayer } from '../index';

function catchError(fn: () => unknown): PlayerError {
	try { fn(); }
	catch (e) { return e as PlayerError; }
	throw new Error('catchError: fn did not throw');
}

describe('NMMusicPlayer constructor', () => {
	beforeEach(() => {
		(NMMusicPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
	});

	afterEach(() => {
		document.body.innerHTML = '';
		(NMMusicPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
	});

	describe('three-form signature', () => {
		it('string form: nmMPlayer("divId") mounts to the matching div', () => {
			const div = document.createElement('div');
			div.id = 'test-music-1';
			document.body.appendChild(div);
			const player = nmMPlayer('test-music-1');
			expect(player.id).toBe('test-music-1');
			expect(player.container).toBe(div);
		});

		it('no-arg form: nmMPlayer() returns first registered instance', () => {
			const div = document.createElement('div');
			div.id = 'first-music';
			document.body.appendChild(div);
			const first = nmMPlayer('first-music');
			expect(nmMPlayer()).toBe(first);
		});

		it('numeric form: nmMPlayer(0) returns first registered instance', () => {
			const a = document.createElement('div'); a.id = 'idx-a'; document.body.appendChild(a);
			const b = document.createElement('div'); b.id = 'idx-b'; document.body.appendChild(b);
			const first = nmMPlayer('idx-a');
			nmMPlayer('idx-b');
			expect(nmMPlayer(0)).toBe(first);
		});

		it('new NMMusicPlayer(stringId) mounts the same way', () => {
			const div = document.createElement('div');
			div.id = 'test-music-class';
			document.body.appendChild(div);
			const player = new NMMusicPlayer('test-music-class');
			expect(player.id).toBe('test-music-class');
			expect(player.container).toBe(div);
		});
	});

	describe('error codes', () => {
		it('no instances + no arg → core:player/no-element', () => {
			expect(() => nmMPlayer()).toThrow(/core:player\/no-element/);
		});

		it('numeric arg with no matching instance → core:player/not-found', () => {
			expect(() => nmMPlayer(999)).toThrow(/core:player\/not-found/);
		});

		it('string arg with no matching DOM element → core:player/element-missing', () => {
			expect(() => nmMPlayer('absent-div')).toThrow(/core:player\/element-missing/);
		});

		it('string arg pointing at a non-div element → core:player/element-not-div', () => {
			const span = document.createElement('span');
			span.id = 'span-not-div';
			document.body.appendChild(span);
			expect(() => nmMPlayer('span-not-div')).toThrow(/core:player\/element-not-div/);
		});

		it('non-string-non-number arg → core:player/invalid-id-type', () => {
			expect(() => nmMPlayer(true as any)).toThrow(/core:player\/invalid-id-type/);
		});
	});

	describe('error spec adherence', () => {
		it('thrown errors are real PlayerError subclasses, never raw Error', () => {
			const err = catchError(() => nmMPlayer());
			expect(err).toBeInstanceOf(PlayerError);
			expect(err).toBeInstanceOf(StateError);
		});

		it('no-element error carries spec fields: code, severity, scope', () => {
			const err = catchError(() => nmMPlayer());
			expect(err.code).toBe('core:player/no-element');
			expect(err.severity).toBe('error');
			expect(err.scope).toEqual({ kind: 'core' });
		});

		it('not-found error carries spec fields', () => {
			const err = catchError(() => nmMPlayer(999));
			expect(err.code).toBe('core:player/not-found');
			expect(err.severity).toBe('error');
			expect(err.scope).toEqual({ kind: 'core' });
		});

		it('element-missing error is a ResourceError (not StateError)', () => {
			const err = catchError(() => nmMPlayer('absent-div'));
			expect(err).toBeInstanceOf(ResourceError);
			expect(err.code).toBe('core:player/element-missing');
		});

		it('element-not-div error is a StateError', () => {
			const span = document.createElement('span');
			span.id = 'spec-span-not-div';
			document.body.appendChild(span);
			const err = catchError(() => nmMPlayer('spec-span-not-div'));
			expect(err).toBeInstanceOf(StateError);
			expect(err.code).toBe('core:player/element-not-div');
		});

		it('invalid-id-type error is a StateError', () => {
			const err = catchError(() => nmMPlayer(true as any));
			expect(err).toBeInstanceOf(StateError);
			expect(err.code).toBe('core:player/invalid-id-type');
		});
	});

	describe('registry pattern', () => {
		it('idempotent: calling nmMPlayer("x") twice returns the SAME instance', () => {
			const div = document.createElement('div');
			div.id = 'idempotent';
			document.body.appendChild(div);

			const first = nmMPlayer('idempotent');
			const second = nmMPlayer('idempotent');
			expect(first).toBe(second);
		});

		it('different ids produce different instances', () => {
			const a = document.createElement('div'); a.id = 'pa'; document.body.appendChild(a);
			const b = document.createElement('div'); b.id = 'pb'; document.body.appendChild(b);

			const first = nmMPlayer('pa');
			const second = nmMPlayer('pb');
			expect(first).not.toBe(second);
		});

		it('registry survives constructor return-override (instanceof still works)', () => {
			const div = document.createElement('div');
			div.id = 'instanceof-check';
			document.body.appendChild(div);

			const first = nmMPlayer('instanceof-check');
			const second = new NMMusicPlayer('instanceof-check');
			expect(second).toBe(first);
			expect(second).toBeInstanceOf(NMMusicPlayer);
		});
	});

	describe('id getter', () => {
		it('reads back the constructor id and mirrors playerId', () => {
			const div = document.createElement('div'); div.id = 'getter-test'; document.body.appendChild(div);

			const player = nmMPlayer('getter-test');
			expect(player.id).toBe('getter-test');
			expect(player.playerId).toBe('getter-test');
			expect(player.id).toBe(player.playerId);
		});
	});
});
