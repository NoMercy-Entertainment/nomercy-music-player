import Hls from 'hls.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AudioElementBackend } from '../adapters/audio-backend/html5-audio';

describe('AudioElementBackend secondary authorization', () => {
	afterEach(() => {
		document.body.innerHTML = '';
		vi.restoreAllMocks();
	});

	it('adds the current authorization token to a secondary audio URL', async () => {
		const container = document.createElement('div');
		document.body.appendChild(container);
		const backend = new AudioElementBackend(container);
		backend.setAuthHeaderProvider(() => 'Bearer next-track-token');

		const loading = backend.loadSecondary('https://media.example.test/next.mp3');
		const secondary = container.querySelectorAll('audio')[1]!;
		secondary.dispatchEvent(new Event('loadedmetadata'));
		await loading;

		expect(secondary.src).toContain('next-track-token');
		backend.dispose();
	});

	it('attaches an HLS manifest to the secondary element', async () => {
		const attachMedia = vi.spyOn(Hls.prototype, 'attachMedia');
		const loadSource = vi.spyOn(Hls.prototype, 'loadSource');
		const container = document.createElement('div');
		document.body.appendChild(container);
		const backend = new AudioElementBackend(container);

		const loading = backend.loadSecondary('https://media.example.test/next.m3u8');
		await vi.waitFor(() => expect(loadSource).toHaveBeenCalledWith('https://media.example.test/next.m3u8'));
		const secondary = container.querySelectorAll('audio')[1]!;
		expect(attachMedia).toHaveBeenCalledWith(secondary);
		secondary.dispatchEvent(new Event('loadedmetadata'));
		await loading;
		backend.dispose();
	});
});
