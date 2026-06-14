/**
 * V1MusicCompatPlugin — migration shim tests.
 *
 * Four proof categories mandated by the task spec:
 *  (a) Representative v1 method calls delegate to the correct v2 behaviour.
 *  (b) v1 event subscriptions receive a reshaped payload matching the v1 shape.
 *  (c) Deprecation warnings fire ONCE per distinct v1 API name, not once-per-call.
 *  (d) Removed-in-v2 no-op shims warn and do not throw.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NMMusicPlayer } from '../../index';
import { V1MusicCompatPlugin, v1MusicCompatPlugin } from '../../plugins/v1-compat';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const setup = (): NMMusicPlayer => new NMMusicPlayer('test').setup({});

/**
 * Retrieve a dynamically-patched shim method from the player instance.
 * Necessary because shim methods are attached at runtime and are not part
 * of the typed NMMusicPlayer interface.
 *
 * `as unknown as Record<string, unknown>` is required to cross the typed→dynamic
 * boundary; the subsequent typeof guard provides the actual narrowing.
 */
function shim(player: NMMusicPlayer, name: string): (...args: unknown[]) => unknown {
	const target = player as unknown as Record<string, unknown>;
	const method = target[name];
	if (typeof method !== 'function') {
		throw new TypeError(`Shim method "${name}" not found on player instance — was addPlugin called?`);
	}
	// typeof guard above narrows `method` to Function; the call-signature cast
	// is the minimum needed to invoke it with unknown args — not a type laundering.
	return method as (...args: unknown[]) => unknown;
}

/**
 * Register a v1 event via the shimmed on() interceptor.
 */
function shimOn(player: NMMusicPlayer, event: string, fn: (data: unknown) => void): void {
	const target = player as unknown as Record<string, unknown>;
	const onFn = target['on'];
	if (typeof onFn !== 'function') {
		throw new TypeError('on() not found on player instance');
	}
	// typeof guard above narrows to Function; cast to the concrete call signature.
	(onFn as (ev: string, cb: (d: unknown) => void) => void)(event, fn);
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('V1MusicCompatPlugin', () => {
	beforeEach(() => {
		(NMMusicPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		const div = document.createElement('div');
		div.id = 'test';
		document.body.appendChild(div);
		vi.spyOn(console, 'warn').mockImplementation(() => undefined);
	});

	afterEach(() => {
		(NMMusicPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		document.body.innerHTML = '';
		vi.restoreAllMocks();
	});

	// ── Plugin registration ──────────────────────────────────────────────────

	describe('registration', () => {
		it('has static id "v1-compat"', () => {
			expect(V1MusicCompatPlugin.id).toBe('v1-compat');
		});

		it('alias v1MusicCompatPlugin is the same class', () => {
			expect(v1MusicCompatPlugin).toBe(V1MusicCompatPlugin);
		});

		it('registers and initialises without throwing', async () => {
			const player = setup();
			expect(() => player.addPlugin(V1MusicCompatPlugin)).not.toThrow();
			await player.ready();
			expect(player.getPlugin(V1MusicCompatPlugin)).toBeDefined();
			player.dispose();
		});

		it('disposes cleanly without throwing', async () => {
			const player = setup();
			player.addPlugin(V1MusicCompatPlugin);
			await player.ready();
			expect(() => player.dispose()).not.toThrow();
		});
	});

	// ── (a) Method shims ─────────────────────────────────────────────────────

	describe('(a) method shims delegate to v2 equivalents', () => {
		it('seek(30) → time(30)', async () => {
			const player = setup();
			player.addPlugin(V1MusicCompatPlugin);
			await player.ready();

			const spy = vi.spyOn(player, 'time');
			shim(player, 'seek')(30);
			expect(spy).toHaveBeenCalledWith(30);
			player.dispose();
		});

		it('getCurrentTime() → time()', async () => {
			const player = setup();
			player.addPlugin(V1MusicCompatPlugin);
			await player.ready();

			const spy = vi.spyOn(player, 'time');
			shim(player, 'getCurrentTime')();
			expect(spy).toHaveBeenCalled();
			player.dispose();
		});

		it('getDuration() → duration()', async () => {
			const player = setup();
			player.addPlugin(V1MusicCompatPlugin);
			await player.ready();

			const spy = vi.spyOn(player, 'duration');
			shim(player, 'getDuration')();
			expect(spy).toHaveBeenCalled();
			player.dispose();
		});

		it('getBuffer() → buffered()', async () => {
			const player = setup();
			player.addPlugin(V1MusicCompatPlugin);
			await player.ready();

			const spy = vi.spyOn(player, 'buffered');
			shim(player, 'getBuffer')();
			expect(spy).toHaveBeenCalled();
			player.dispose();
		});

		it('setVolume(70) → volume(70)', async () => {
			const player = setup();
			player.addPlugin(V1MusicCompatPlugin);
			await player.ready();

			const spy = vi.spyOn(player, 'volume');
			shim(player, 'setVolume')(70);
			expect(spy).toHaveBeenCalledWith(70);
			player.dispose();
		});

		it('getVolume() → volume()', async () => {
			const player = setup();
			player.addPlugin(V1MusicCompatPlugin);
			await player.ready();

			const spy = vi.spyOn(player, 'volume');
			shim(player, 'getVolume')();
			expect(spy).toHaveBeenCalled();
			player.dispose();
		});

		it('getQueue() → queue() read', async () => {
			const player = setup();
			player.addPlugin(V1MusicCompatPlugin);
			await player.ready();

			const spy = vi.spyOn(player, 'queue');
			shim(player, 'getQueue')();
			expect(spy).toHaveBeenCalled();
			player.dispose();
		});

		it('setQueue(items) → queue(items)', async () => {
			const player = setup();
			player.addPlugin(V1MusicCompatPlugin);
			await player.ready();

			const spy = vi.spyOn(player, 'queue');
			const items = [{ id: 'a', name: 'Track A' }];
			shim(player, 'setQueue')(items);
			expect(spy).toHaveBeenCalledWith(items);
			player.dispose();
		});

		it('addToQueue(item) → queueAppend(item)', async () => {
			const player = setup();
			player.addPlugin(V1MusicCompatPlugin);
			await player.ready();

			const spy = vi.spyOn(player, 'queueAppend');
			const item = { id: 'b', name: 'Track B' };
			shim(player, 'addToQueue')(item);
			expect(spy).toHaveBeenCalledWith(item);
			player.dispose();
		});

		it('addToQueueNext(item) → queuePrepend(item)', async () => {
			const player = setup();
			player.addPlugin(V1MusicCompatPlugin);
			await player.ready();

			const spy = vi.spyOn(player, 'queuePrepend');
			const item = { id: 'c', name: 'Track C' };
			shim(player, 'addToQueueNext')(item);
			expect(spy).toHaveBeenCalledWith(item);
			player.dispose();
		});

		it('removeFromQueue(item with id) → queueRemove(id)', async () => {
			const player = setup();
			player.addPlugin(V1MusicCompatPlugin);
			await player.ready();

			const spy = vi.spyOn(player, 'queueRemove');
			shim(player, 'removeFromQueue')({ id: 'x' });
			expect(spy).toHaveBeenCalledWith('x');
			player.dispose();
		});

		it('getBackLog() → backlog() read', async () => {
			const player = setup();
			player.addPlugin(V1MusicCompatPlugin);
			await player.ready();

			const spy = vi.spyOn(player, 'backlog');
			shim(player, 'getBackLog')();
			expect(spy).toHaveBeenCalled();
			player.dispose();
		});

		it('setCurrentSong(track) → item(track)', async () => {
			const player = setup();
			player.addPlugin(V1MusicCompatPlugin);
			await player.ready();

			const spy = vi.spyOn(player, 'item');
			const track = { id: 'track1', name: 'Song' };
			shim(player, 'setCurrentSong')(track);
			expect(spy).toHaveBeenCalledWith(track);
			player.dispose();
		});

		it('currentSong (property getter) → item()', async () => {
			const player = setup();
			player.addPlugin(V1MusicCompatPlugin);
			await player.ready();

			const spy = vi.spyOn(player, 'item');
			// currentSong is a property getter, not a callable method.
			// Reading it must invoke player.item() — no parentheses.
			void (player as unknown as Record<string, unknown>)['currentSong'];
			expect(spy).toHaveBeenCalled();
			player.dispose();
		});

		it('playTrack(track, tracks) → queue(tracks) then item(track)', async () => {
			const player = setup();
			player.addPlugin(V1MusicCompatPlugin);
			await player.ready();

			const queueSpy = vi.spyOn(player, 'queue');
			const itemSpy = vi.spyOn(player, 'item');
			const track = { id: 't1', name: 'A' };
			const tracks = [track, { id: 't2', name: 'B' }];
			shim(player, 'playTrack')(track, tracks);
			expect(queueSpy).toHaveBeenCalledWith(tracks);
			expect(itemSpy).toHaveBeenCalledWith(track);
			player.dispose();
		});

		it('repeat(value) → repeatState(value)', async () => {
			const player = setup();
			player.addPlugin(V1MusicCompatPlugin);
			await player.ready();

			const spy = vi.spyOn(player, 'repeatState');
			shim(player, 'repeat')('all');
			expect(spy).toHaveBeenCalledWith('all');
			player.dispose();
		});

		it('setAccessToken(token) → auth({ bearerToken: token })', async () => {
			const player = setup();
			player.addPlugin(V1MusicCompatPlugin);
			await player.ready();

			const spy = vi.spyOn(player, 'auth');
			shim(player, 'setAccessToken')('my-token');
			expect(spy).toHaveBeenCalledWith({ bearerToken: 'my-token' });
			player.dispose();
		});

		it('setBaseUrl(url) → baseUrl(url)', async () => {
			const player = setup();
			player.addPlugin(V1MusicCompatPlugin);
			await player.ready();

			const spy = vi.spyOn(player, 'baseUrl');
			shim(player, 'setBaseUrl')('https://example.com');
			expect(spy).toHaveBeenCalledWith('https://example.com');
			player.dispose();
		});
	});

	// ── (b) Event bridges ────────────────────────────────────────────────────

	describe('(b) v1 event subscriptions receive reshaped v1 payloads', () => {
		it('on("time", fn) receives V1TimeState when v2 time event fires', async () => {
			const player = setup();
			player.addPlugin(V1MusicCompatPlugin);
			await player.ready();

			const received: unknown[] = [];
			shimOn(player, 'time', (data) => { received.push(data); });

			player.emit('time' as never, { time: 55 } as never);

			expect(received).toHaveLength(1);
			const payload = received[0] as Record<string, unknown>;
			// v1 TimeState uses 'position' not 'currentTime'
			expect(payload['position']).toBe(55);
			expect(payload['buffered']).toBeDefined();
			expect(payload['duration']).toBeDefined();
			expect(payload['remaining']).toBeDefined();
			player.dispose();
		});

		it('on("song", fn) receives the item object from v2 "item" event', async () => {
			const player = setup();
			player.addPlugin(V1MusicCompatPlugin);
			await player.ready();

			const received: unknown[] = [];
			shimOn(player, 'song', (data) => { received.push(data); });

			const fakeItem = { id: 'song-1', name: 'Test Song' };
			player.emit('item' as never, { item: fakeItem, index: 0 } as never);

			expect(received).toHaveLength(1);
			expect(received[0]).toEqual(fakeItem);
			player.dispose();
		});

		it('on("repeat", fn) receives the repeat state string from v2 repeat event', async () => {
			const player = setup();
			player.addPlugin(V1MusicCompatPlugin);
			await player.ready();

			const received: unknown[] = [];
			shimOn(player, 'repeat', (data) => { received.push(data); });

			player.emit('repeat' as never, { state: 'all' } as never);

			expect(received).toHaveLength(1);
			expect(received[0]).toBe('all');
			player.dispose();
		});

		it('on("shuffle", fn) receives boolean from v2 shuffle event', async () => {
			const player = setup();
			player.addPlugin(V1MusicCompatPlugin);
			await player.ready();

			const received: unknown[] = [];
			shimOn(player, 'shuffle', (data) => { received.push(data); });

			player.emit('shuffle' as never, { state: 'on' } as never);

			expect(received).toHaveLength(1);
			expect(received[0]).toBe(true);
			player.dispose();
		});

		it('on("volume", fn) receives a raw number from v2 volume event', async () => {
			const player = setup();
			player.addPlugin(V1MusicCompatPlugin);
			await player.ready();

			const received: unknown[] = [];
			shimOn(player, 'volume', (data) => { received.push(data); });

			player.emit('volume' as never, { level: 60 } as never);

			expect(received).toHaveLength(1);
			expect(received[0]).toBe(60);
			player.dispose();
		});

		it('on("mute", fn) receives boolean from v2 mute event', async () => {
			const player = setup();
			player.addPlugin(V1MusicCompatPlugin);
			await player.ready();

			const received: unknown[] = [];
			shimOn(player, 'mute', (data) => { received.push(data); });

			player.emit('mute' as never, { muted: true } as never);

			expect(received).toHaveLength(1);
			expect(received[0]).toBe(true);
			player.dispose();
		});

		it('on("seeked", fn) receives V1TimeState — bridged from v2 time event', async () => {
			const player = setup();
			player.addPlugin(V1MusicCompatPlugin);
			await player.ready();

			const received: unknown[] = [];
			shimOn(player, 'seeked', (data) => { received.push(data); });

			player.emit('time' as never, { time: 100 } as never);

			expect(received).toHaveLength(1);
			const payload = received[0] as Record<string, unknown>;
			expect(payload['position']).toBe(100);
			player.dispose();
		});
	});

	// ── (c) Deprecation warns once ───────────────────────────────────────────

	describe('(c) deprecation warning fires ONCE per distinct v1 API name', () => {
		it('warns once — second and third calls produce no additional warn', async () => {
			const player = setup();
			player.addPlugin(V1MusicCompatPlugin);
			await player.ready();

			// Use 'pushToQueue' — distinct enough to avoid cross-test collision.
			const countBefore = (console.warn as ReturnType<typeof vi.spyOn>).mock.calls
				.filter((args: unknown[]) => String(args[0]).includes('"pushToQueue')).length;

			shim(player, 'pushToQueue')({ id: 'x', name: 'X' });
			const countAfterFirst = (console.warn as ReturnType<typeof vi.spyOn>).mock.calls
				.filter((args: unknown[]) => String(args[0]).includes('"pushToQueue')).length;

			shim(player, 'pushToQueue')({ id: 'y', name: 'Y' });
			shim(player, 'pushToQueue')({ id: 'z', name: 'Z' });
			const countAfterThird = (console.warn as ReturnType<typeof vi.spyOn>).mock.calls
				.filter((args: unknown[]) => String(args[0]).includes('"pushToQueue')).length;

			expect(countAfterFirst - countBefore).toBe(1);
			expect(countAfterThird - countBefore).toBe(1);
			player.dispose();
		});

		it('warns once per distinct name — two names accumulate independently', async () => {
			const player = setup();
			player.addPlugin(V1MusicCompatPlugin);
			await player.ready();

			const addBefore = (console.warn as ReturnType<typeof vi.spyOn>).mock.calls
				.filter((args: unknown[]) => String(args[0]).includes('"addToBackLog')).length;
			const pushBefore = (console.warn as ReturnType<typeof vi.spyOn>).mock.calls
				.filter((args: unknown[]) => String(args[0]).includes('"pushToBackLog')).length;

			shim(player, 'addToBackLog')({ id: 'a', name: 'A' });
			shim(player, 'addToBackLog')({ id: 'b', name: 'B' });
			shim(player, 'pushToBackLog')({ id: 'c', name: 'C' });
			shim(player, 'pushToBackLog')({ id: 'd', name: 'D' });

			const addAfter = (console.warn as ReturnType<typeof vi.spyOn>).mock.calls
				.filter((args: unknown[]) => String(args[0]).includes('"addToBackLog')).length;
			const pushAfter = (console.warn as ReturnType<typeof vi.spyOn>).mock.calls
				.filter((args: unknown[]) => String(args[0]).includes('"pushToBackLog')).length;

			expect(addAfter - addBefore).toBe(1);
			expect(pushAfter - pushBefore).toBe(1);
			player.dispose();
		});

		it('warns once when the same v1 event is subscribed multiple times', async () => {
			const player = setup();
			player.addPlugin(V1MusicCompatPlugin);
			await player.ready();

			// 'crossfadeStart' keeps its name in v2 but its payload is reshaped,
			// so the once-guard applies to the payload-bridged message.
			const repeatKey = `on('crossfadeStart') is delivered with its v1 payload shape`;
			const countBefore = (console.warn as ReturnType<typeof vi.spyOn>).mock.calls
				.filter((args: unknown[]) => String(args[0]).includes(repeatKey)).length;

			shimOn(player, 'crossfadeStart', () => undefined);
			shimOn(player, 'crossfadeStart', () => undefined);

			const countAfter = (console.warn as ReturnType<typeof vi.spyOn>).mock.calls
				.filter((args: unknown[]) => String(args[0]).includes(repeatKey)).length;

			expect(countAfter - countBefore).toBe(1);
			player.dispose();
		});

		it('same-name reshaped event never says "use X instead of X"; renamed event names the v2 target; passthrough stays silent', async () => {
			const player = setup();
			player.addPlugin(V1MusicCompatPlugin);
			await player.ready();

			const warnsFor = (needle: string): number =>
				(console.warn as ReturnType<typeof vi.spyOn>).mock.calls.filter((args: unknown[]) => String(args[0]).includes(needle)).length;

			// 'pause' and 'queue' are untouched by the rest of this suite — the
			// module-level once-guard swallows warnings for already-used names.
			shimOn(player, 'pause', () => undefined);
			expect(warnsFor(`use "on('pause')" instead`)).toBe(0);
			expect(warnsFor(`on('pause') is delivered with its v1 payload shape`)).toBe(1);

			shimOn(player, 'queue', () => undefined);
			expect(warnsFor(`DEPRECATED "on('queue')" — use "on('ready')"`)).toBe(1);

			const readyBefore = warnsFor(`on('ready')`);
			shimOn(player, 'ready', () => undefined);
			expect(warnsFor(`on('ready')`)).toBe(readyBefore);
			player.dispose();
		});
	});

	// ── (d) Removed-API no-ops ───────────────────────────────────────────────

	describe('(d) removed-in-v2 shims warn once and do not throw', () => {
		const removedMethods = [
			'loadEqualizerSettings',
			'saveEqualizerSettings',
		] as const;

		for (const methodName of removedMethods) {
			it(`${methodName}() — warns once, does not throw`, async () => {
				const player = setup();
				player.addPlugin(V1MusicCompatPlugin);
				await player.ready();

				expect(() => shim(player, methodName)()).not.toThrow();

				const relevantWarns = (console.warn as ReturnType<typeof vi.spyOn>).mock.calls
					.filter((args: unknown[]) => String(args[0]).includes(`"${methodName}`));
				expect(relevantWarns.length).toBe(1);

				// Call again — still only one warning.
				shim(player, methodName)();
				const relevantWarnsAfter = (console.warn as ReturnType<typeof vi.spyOn>).mock.calls
					.filter((args: unknown[]) => String(args[0]).includes(`"${methodName}`));
				expect(relevantWarnsAfter.length).toBe(1);
				player.dispose();
			});
		}

		it('setPreGain(5) — warns and no-ops without throwing', async () => {
			const player = setup();
			player.addPlugin(V1MusicCompatPlugin);
			await player.ready();

			expect(() => shim(player, 'setPreGain')(5)).not.toThrow();

			const warns = (console.warn as ReturnType<typeof vi.spyOn>).mock.calls
				.filter((args: unknown[]) => String(args[0]).includes('"setPreGain'));
			expect(warns.length).toBe(1);
			player.dispose();
		});

		it('setPanner(0.5) — warns and no-ops without throwing', async () => {
			const player = setup();
			player.addPlugin(V1MusicCompatPlugin);
			await player.ready();

			expect(() => shim(player, 'setPanner')(0.5)).not.toThrow();

			const warns = (console.warn as ReturnType<typeof vi.spyOn>).mock.calls
				.filter((args: unknown[]) => String(args[0]).includes('"setPanner'));
			expect(warns.length).toBe(1);
			player.dispose();
		});

		it('setFilter(band) — warns and no-ops without throwing', async () => {
			const player = setup();
			player.addPlugin(V1MusicCompatPlugin);
			await player.ready();

			expect(() => shim(player, 'setFilter')({ frequency: 1000, gain: 3 })).not.toThrow();

			const warns = (console.warn as ReturnType<typeof vi.spyOn>).mock.calls
				.filter((args: unknown[]) => String(args[0]).includes('"setFilter'));
			expect(warns.length).toBe(1);
			player.dispose();
		});

		it('setAutoPlayback(false) — warns once, best-effort only, does not throw', async () => {
			const player = setup();
			player.addPlugin(V1MusicCompatPlugin);
			await player.ready();

			expect(() => shim(player, 'setAutoPlayback')(false)).not.toThrow();

			const warns = (console.warn as ReturnType<typeof vi.spyOn>).mock.calls
				.filter((args: unknown[]) => String(args[0]).includes('"setAutoPlayback'));
			expect(warns.length).toBe(1);
			player.dispose();
		});
	});

	// ── Dispose restores on() ────────────────────────────────────────────────

	describe('dispose restores original on()', () => {
		it('on() is restored after plugin dispose', async () => {
			const player = setup();
			const originalOn = player.on;
			player.addPlugin(V1MusicCompatPlugin);
			await player.ready();

			player.removePlugin(V1MusicCompatPlugin);

			expect(player.on).toBe(originalOn);
		});
	});

	// ── (e) New shims: EQ stubs, audio element stubs, getCurrentSong, siteTitle ──

	describe('(e) newly added v1 surface shims', () => {
		// ── getCurrentSong ──────────────────────────────────────────────────────

		it('getCurrentSong() → item()', async () => {
			const player = setup();
			player.addPlugin(V1MusicCompatPlugin);
			await player.ready();

			const spy = vi.spyOn(player, 'item');
			shim(player, 'getCurrentSong')();
			expect(spy).toHaveBeenCalled();
			player.dispose();
		});

		it('getCurrentSong() does not re-warn on repeated calls', async () => {
			const player = setup();
			player.addPlugin(V1MusicCompatPlugin);
			await player.ready();

			// Call once to ensure the warning fires (may already be suppressed from
			// earlier tests due to module-level _warnedSet — that is correct behaviour).
			shim(player, 'getCurrentSong')();
			const countAfterFirst = (console.warn as ReturnType<typeof vi.spyOn>).mock.calls
				.filter((args: unknown[]) => String(args[0]).includes('"getCurrentSong()'))
				.length;

			// Second call must NOT add another warning.
			shim(player, 'getCurrentSong')();
			const countAfterSecond = (console.warn as ReturnType<typeof vi.spyOn>).mock.calls
				.filter((args: unknown[]) => String(args[0]).includes('"getCurrentSong()'))
				.length;

			expect(countAfterSecond).toBe(countAfterFirst);
			player.dispose();
		});

		// ── EQ stubs ────────────────────────────────────────────────────────────

		it('equalizerBands property getter returns an array and warns once', async () => {
			const player = setup();
			player.addPlugin(V1MusicCompatPlugin);
			await player.ready();

			const target = player as unknown as Record<string, unknown>;
			const result = target['equalizerBands'];
			expect(Array.isArray(result)).toBe(true);
			expect((result as unknown[]).length).toBeGreaterThan(0);

			// Second read — still only one warning.
			void target['equalizerBands'];
			const warns = (console.warn as ReturnType<typeof vi.spyOn>).mock.calls
				.filter((args: unknown[]) => String(args[0]).includes('"equalizerBands"'));
			expect(warns.length).toBe(1);
			player.dispose();
		});

		it('equalizerPresets property getter returns an array and warns once', async () => {
			const player = setup();
			player.addPlugin(V1MusicCompatPlugin);
			await player.ready();

			const target = player as unknown as Record<string, unknown>;
			const result = target['equalizerPresets'];
			expect(Array.isArray(result)).toBe(true);

			void target['equalizerPresets'];
			const warns = (console.warn as ReturnType<typeof vi.spyOn>).mock.calls
				.filter((args: unknown[]) => String(args[0]).includes('"equalizerPresets"'));
			expect(warns.length).toBe(1);
			player.dispose();
		});

		it('equalizerPanning getter returns 0 by default and warns once', async () => {
			const player = setup();
			player.addPlugin(V1MusicCompatPlugin);
			await player.ready();

			const target = player as unknown as Record<string, unknown>;
			const result = target['equalizerPanning'];
			expect(result).toBe(0);

			void target['equalizerPanning'];
			const warns = (console.warn as ReturnType<typeof vi.spyOn>).mock.calls
				.filter((args: unknown[]) => String(args[0]).includes('"equalizerPanning"'));
			expect(warns.length).toBe(1);
			player.dispose();
		});

		it('equalizerSliderValues getter returns slider-range config object and warns once', async () => {
			const player = setup();
			player.addPlugin(V1MusicCompatPlugin);
			await player.ready();

			const target = player as unknown as Record<string, unknown>;
			const result = target['equalizerSliderValues'] as Record<string, unknown>;
			expect(typeof result).toBe('object');
			expect(result).toHaveProperty('pan');
			expect(result).toHaveProperty('pre');
			expect(result).toHaveProperty('band');

			void target['equalizerSliderValues'];
			const warns = (console.warn as ReturnType<typeof vi.spyOn>).mock.calls
				.filter((args: unknown[]) => String(args[0]).includes('"equalizerSliderValues"'));
			expect(warns.length).toBe(1);
			player.dispose();
		});

		// ── _audioElement1 / _audioElement2 stubs ───────────────────────────────

		it('_audioElement1.motion returns null without throwing', async () => {
			const player = setup();
			player.addPlugin(V1MusicCompatPlugin);
			await player.ready();

			const target = player as unknown as Record<string, unknown>;
			const el1 = target['_audioElement1'] as { motion: unknown };
			expect(el1).toBeDefined();
			expect(el1.motion).toBeNull();
			player.dispose();
		});

		it('_audioElement2.motion returns null without throwing', async () => {
			const player = setup();
			player.addPlugin(V1MusicCompatPlugin);
			await player.ready();

			const target = player as unknown as Record<string, unknown>;
			const el2 = target['_audioElement2'] as { motion: unknown };
			expect(el2).toBeDefined();
			expect(el2.motion).toBeNull();
			player.dispose();
		});

		it('_audioElement1 does not re-warn on repeated reads', async () => {
			const player = setup();
			player.addPlugin(V1MusicCompatPlugin);
			await player.ready();

			const target = player as unknown as Record<string, unknown>;
			// First read — may or may not warn (module-level once-guard may already have fired).
			void target['_audioElement1'];
			const countAfterFirst = (console.warn as ReturnType<typeof vi.spyOn>).mock.calls
				.filter((args: unknown[]) => String(args[0]).includes('"_audioElement1"'))
				.length;

			// Second read — must NOT add another warning.
			void target['_audioElement1'];
			const countAfterSecond = (console.warn as ReturnType<typeof vi.spyOn>).mock.calls
				.filter((args: unknown[]) => String(args[0]).includes('"_audioElement1"'))
				.length;

			expect(countAfterSecond).toBe(countAfterFirst);
			player.dispose();
		});

		// ── siteTitle ────────────────────────────────────────────────────────────

		it('siteTitle getter returns a string and warns', async () => {
			const player = setup();
			player.addPlugin(V1MusicCompatPlugin);
			await player.ready();

			const target = player as unknown as Record<string, unknown>;
			const title = target['siteTitle'];
			expect(typeof title).toBe('string');

			const warns = (console.warn as ReturnType<typeof vi.spyOn>).mock.calls
				.filter((args: unknown[]) => String(args[0]).includes('"siteTitle"'));
			expect(warns.length).toBe(1);
			player.dispose();
		});

		it('setSiteTitle(value) warns and does not throw', async () => {
			const player = setup();
			player.addPlugin(V1MusicCompatPlugin);
			await player.ready();

			expect(() => shim(player, 'setSiteTitle')('My App')).not.toThrow();

			const warns = (console.warn as ReturnType<typeof vi.spyOn>).mock.calls
				.filter((args: unknown[]) => String(args[0]).includes('"setSiteTitle'));
			expect(warns.length).toBe(1);
			player.dispose();
		});

		// ── stop event bridge ────────────────────────────────────────────────────

		it('on("stop", fn) fires when v2 stop event fires', async () => {
			const player = setup();
			player.addPlugin(V1MusicCompatPlugin);
			await player.ready();

			const received: unknown[] = [];
			shimOn(player, 'stop', (data) => { received.push(data); });

			player.emit('stop' as never);

			expect(received).toHaveLength(1);
			player.dispose();
		});

		// ── playback rate aliases ────────────────────────────────────────────────

		it('setPlaybackRate(1.5) → playbackRate(1.5)', async () => {
			const player = setup();
			player.addPlugin(V1MusicCompatPlugin);
			await player.ready();

			const spy = vi.spyOn(player, 'playbackRate');
			shim(player, 'setPlaybackRate')(1.5);
			expect(spy).toHaveBeenCalledWith(1.5);
			player.dispose();
		});

		it('getPlaybackRate() → playbackRate()', async () => {
			const player = setup();
			player.addPlugin(V1MusicCompatPlugin);
			await player.ready();

			const spy = vi.spyOn(player, 'playbackRate');
			shim(player, 'getPlaybackRate')();
			expect(spy).toHaveBeenCalled();
			player.dispose();
		});
	});
});
