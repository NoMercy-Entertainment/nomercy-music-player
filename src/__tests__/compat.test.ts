import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { applyMusicV1Compat, nmMPlayer, nmMusicPlayer, normalizeMusicItem } from '../compat';
import { nmMusicPlayer as canonicalNmMusicPlayer, nmMPlayer as mainNmMPlayer, NMMusicPlayer, PlayerCore } from '../index';

describe('normalizeMusicItem', () => {
	it('maps artist_track array to plain artist string', () => {
		const result = normalizeMusicItem({
			id: '1',
			name: 'Track',
			artist_track: [{ id: 1, name: 'A' }],
		});
		expect(result.artist).toBe('A');
		expect('artist_track' in result).toBe(false);
	});

	it('maps album_track array to plain album string', () => {
		const result = normalizeMusicItem({
			id: '1',
			name: 'Track',
			album_track: [{ id: 2, name: 'B' }],
		});
		expect(result.album).toBe('B');
		expect('album_track' in result).toBe(false);
	});

	it('does not overwrite existing artist when artist_track also present', () => {
		const result = normalizeMusicItem({
			id: '1',
			name: 'Track',
			artist_track: [{ id: 99, name: 'Old' }],
			artist: 'Winner',
		});
		expect(result.artist).toBe('Winner');
	});

	it('passes through items that are already v2-clean', () => {
		const result = normalizeMusicItem({
			id: '1',
			name: 'Track',
			artistTracks: [{ id: 1, name: 'A' }],
		});
		expect(result.artistTracks).toEqual([{ id: 1, name: 'A' }]);
	});
});

describe('applyMusicV1Compat', () => {
	it('maps debug:true to logLevel:"debug"', () => {
		const result = applyMusicV1Compat({ debug: true });
		expect(result.logLevel).toBe('debug');
	});

	it('maps accessToken to auth.bearerToken', () => {
		const result = applyMusicV1Compat({ accessToken: 'tok' });
		expect(result.auth?.bearerToken).toBe('tok');
	});

	it('does not overwrite existing auth.bearerToken', () => {
		const result = applyMusicV1Compat({
			accessToken: 'old',
			auth: { bearerToken: 'winner' },
		});
		expect(result.auth?.bearerToken).toBe('winner');
	});
});

describe('factory aliases', () => {
	beforeEach(() => {
		(NMMusicPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		const div = document.createElement('div');
		div.id = 'compat-music';
		document.body.appendChild(div);
	});

	afterEach(() => {
		document.body.innerHTML = '';
		(NMMusicPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
	});

	it('nmMPlayer (compat alias) is the same function as nmMusicPlayer (canonical)', () => {
		expect(nmMPlayer).toBe(nmMusicPlayer);
	});

	it('nmMusicPlayer (compat re-export) is the same as index nmMusicPlayer', () => {
		expect(nmMusicPlayer).toBe(canonicalNmMusicPlayer);
	});

	it('nmMPlayer (compat) creates a working NMMusicPlayer instance', () => {
		const player = nmMPlayer('compat-music');
		expect(player).toBeInstanceOf(NMMusicPlayer);
		player.dispose();
	});

	it('nmMusicPlayer (index) creates a working NMMusicPlayer instance', () => {
		(NMMusicPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		const player = mainNmMPlayer('compat-music');
		expect(player).toBeInstanceOf(NMMusicPlayer);
		player.dispose();
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// v1 PlayerCore compatibility
// ─────────────────────────────────────────────────────────────────────────────

describe('PlayerCore v1 compatibility wrapper', () => {
	beforeEach(() => {
		(NMMusicPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
	});

	afterEach(() => {
		(NMMusicPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
	});

	it('PlayerCore is exported as a constructor', () => {
		expect(PlayerCore).toBeDefined();
		expect(typeof PlayerCore).toBe('function');
	});

	it('new PlayerCore({}) constructs without throwing', () => {
		expect(() => new PlayerCore({})).not.toThrow();
	});

	it('new PlayerCore returns an NMMusicPlayer instance', () => {
		const instance = new PlayerCore({});
		expect(instance).toBeInstanceOf(NMMusicPlayer);
	});

	it('PlayerCore instance exposes play/pause/stop/next/previous methods', () => {
		const player = new PlayerCore({}) as unknown as NMMusicPlayer;
		expect(typeof player.play).toBe('function');
		expect(typeof player.pause).toBe('function');
		expect(typeof player.stop).toBe('function');
		expect(typeof player.next).toBe('function');
		expect(typeof player.previous).toBe('function');
	});

	it('PlayerCore expose:true sets window.musicPlayer', () => {
		new PlayerCore({ expose: true });
		expect((window as unknown as Record<string, unknown>)['musicPlayer']).toBeDefined();
		expect((window as unknown as Record<string, unknown>)['musicPlayer']).toBeInstanceOf(NMMusicPlayer);
		delete (window as unknown as Record<string, unknown>)['musicPlayer'];
	});

	it('PlayerCore expose:false does not set window.musicPlayer', () => {
		delete (window as unknown as Record<string, unknown>)['musicPlayer'];
		new PlayerCore({ expose: false });
		expect((window as unknown as Record<string, unknown>)['musicPlayer']).toBeUndefined();
	});
});
