import { describe, expect, it } from 'vitest';

import { applyMusicV1Compat, nmMPlayer, nmMusicPlayer, normalizeMusicItem } from '../compat';
import { nmMusicPlayer as canonicalNmMusicPlayer, nmMPlayer as mainNmMPlayer, NMMusicPlayer } from '../index';

describe('normalizeMusicItem', () => {
	it('renames artist_track to artistTracks', () => {
		const result = normalizeMusicItem({
			id: '1',
			name: 'Track',
			artist_track: [{ id: 1, name: 'A' }],
		});
		expect(result.artistTracks).toEqual([{ id: 1, name: 'A' }]);
		expect('artist_track' in result).toBe(false);
	});

	it('renames album_track to albumTracks', () => {
		const result = normalizeMusicItem({
			id: '1',
			name: 'Track',
			album_track: [{ id: 2, name: 'B' }],
		});
		expect(result.albumTracks).toEqual([{ id: 2, name: 'B' }]);
		expect('album_track' in result).toBe(false);
	});

	it('does not overwrite existing artistTracks / albumTracks', () => {
		const result = normalizeMusicItem({
			id: '1',
			name: 'Track',
			artist_track: [{ id: 99, name: 'Old' }],
			artistTracks: [{ id: 1, name: 'Winner' }],
		});
		expect(result.artistTracks).toEqual([{ id: 1, name: 'Winner' }]);
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
