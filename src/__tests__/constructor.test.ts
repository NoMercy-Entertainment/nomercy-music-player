// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * Real-behavior constructor tests for NMMusicPlayer. Locks the three-form
 * factory contract and the registry pattern.
 *
 * Locked behavior:
 *  - `nmplayer()` (no instances) → throws `core:player/no-element`
 *  - `nmplayer()` (instances exist) → returns first registered instance
 *  - `nmplayer(42)` (no match) → throws `core:player/not-found`
 *  - `nmplayer('myDiv')` (new) → mounts to `<div id="myDiv">` + registers
 *  - `nmplayer('myDiv')` (existing) → returns the existing instance (idempotent)
 *  - `nmplayer('absent')` → throws `core:player/element-missing`
 *  - `nmplayer(<non-div>)` → throws `core:player/element-not-div`
 *  - `nmplayer(true as any)` → throws `core:player/invalid-id-type`
 *  - `id` getter mirrors `playerId`
 *  - Per-library registry (music ↔ video are independent)
 */

import { PlayerError, ResourceError, StateError } from '@nomercy-entertainment/nomercy-player-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NMMusicPlayer, nmplayer } from '../index';

function catchError(fn: () => unknown): PlayerError {
	try { fn(); }
	catch (error) { return error as PlayerError; }
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
		it('string form: nmplayer("divId") mounts to the matching div', () => {
			const div = document.createElement('div');
			div.id = 'test-music-1';
			document.body.appendChild(div);
			const player = nmplayer('test-music-1');
			expect(player.id).toBe('test-music-1');
			expect(player.container).toBe(div);
		});

		it('no-arg form: nmplayer() returns first registered instance', () => {
			const div = document.createElement('div');
			div.id = 'first-music';
			document.body.appendChild(div);
			const first = nmplayer('first-music');
			expect(nmplayer()).toBe(first);
		});

		it('numeric form: nmplayer(0) returns first registered instance', () => {
			const divA = document.createElement('div'); divA.id = 'idx-a'; document.body.appendChild(divA);
			const divB = document.createElement('div'); divB.id = 'idx-b'; document.body.appendChild(divB);
			const first = nmplayer('idx-a');
			nmplayer('idx-b');
			expect(nmplayer(0)).toBe(first);
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
			expect(() => nmplayer()).toThrow(/core:player\/no-element/);
		});

		it('numeric arg with no matching instance → core:player/not-found', () => {
			expect(() => nmplayer(999)).toThrow(/core:player\/not-found/);
		});

		it('string arg with no matching DOM element → core:player/element-missing', () => {
			expect(() => nmplayer('absent-div')).toThrow(/core:player\/element-missing/);
		});

		it('string arg pointing at a non-div element → core:player/element-not-div', () => {
			const span = document.createElement('span');
			span.id = 'span-not-div';
			document.body.appendChild(span);
			expect(() => nmplayer('span-not-div')).toThrow(/core:player\/element-not-div/);
		});

		it('non-string-non-number arg → core:player/invalid-id-type', () => {
			expect(() => nmplayer(true as any)).toThrow(/core:player\/invalid-id-type/);
		});
	});

	describe('error spec adherence', () => {
		it('thrown errors are real PlayerError subclasses, never raw Error', () => {
			const err = catchError(() => nmplayer());
			expect(err).toBeInstanceOf(PlayerError);
			expect(err).toBeInstanceOf(StateError);
		});

		it('no-element error carries spec fields: code, severity, scope', () => {
			const err = catchError(() => nmplayer());
			expect(err.code).toBe('core:player/no-element');
			expect(err.severity).toBe('error');
			expect(err.scope).toEqual({ kind: 'core' });
		});

		it('not-found error carries spec fields', () => {
			const err = catchError(() => nmplayer(999));
			expect(err.code).toBe('core:player/not-found');
			expect(err.severity).toBe('error');
			expect(err.scope).toEqual({ kind: 'core' });
		});

		it('element-missing error is a ResourceError (not StateError)', () => {
			const err = catchError(() => nmplayer('absent-div'));
			expect(err).toBeInstanceOf(ResourceError);
			expect(err.code).toBe('core:player/element-missing');
		});

		it('element-not-div error is a StateError', () => {
			const span = document.createElement('span');
			span.id = 'spec-span-not-div';
			document.body.appendChild(span);
			const err = catchError(() => nmplayer('spec-span-not-div'));
			expect(err).toBeInstanceOf(StateError);
			expect(err.code).toBe('core:player/element-not-div');
		});

		it('invalid-id-type error is a StateError', () => {
			const err = catchError(() => nmplayer(true as any));
			expect(err).toBeInstanceOf(StateError);
			expect(err.code).toBe('core:player/invalid-id-type');
		});
	});

	describe('registry pattern', () => {
		it('idempotent: calling nmplayer("x") twice returns the SAME instance', () => {
			const div = document.createElement('div');
			div.id = 'idempotent';
			document.body.appendChild(div);

			const first = nmplayer('idempotent');
			const second = nmplayer('idempotent');
			expect(first).toBe(second);
		});

		it('different ids produce different instances', () => {
			const divA = document.createElement('div'); divA.id = 'pa'; document.body.appendChild(divA);
			const divB = document.createElement('div'); divB.id = 'pb'; document.body.appendChild(divB);

			const first = nmplayer('pa');
			const second = nmplayer('pb');
			expect(first).not.toBe(second);
		});

		it('registry survives constructor return-override (instanceof still works)', () => {
			const div = document.createElement('div');
			div.id = 'instanceof-check';
			document.body.appendChild(div);

			const first = nmplayer('instanceof-check');
			const second = new NMMusicPlayer('instanceof-check');
			expect(second).toBe(first);
			expect(second).toBeInstanceOf(NMMusicPlayer);
		});
	});

	describe('id getter', () => {
		it('reads back the constructor id and mirrors playerId', () => {
			const div = document.createElement('div'); div.id = 'getter-test'; document.body.appendChild(div);

			const player = nmplayer('getter-test');
			expect(player.id).toBe('getter-test');
			expect(player.playerId).toBe('getter-test');
			expect(player.id).toBe(player.playerId);
		});
	});
});
