import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebAudioBackend } from '../adapters/audio-backend/web-audio';

vi.mock('hls.js', () => {
	class FakeHls {
		static instances: FakeHls[] = [];
		static isSupported = (): boolean => true;
		attachMedia = vi.fn();
		loadSource = vi.fn();
		detachMedia = vi.fn();
		destroy = vi.fn();
		stopLoad = vi.fn();
		startLoad = vi.fn();

		constructor() { FakeHls.instances.push(this); }
	}
	return { default: FakeHls };
});

class MockAudioContext {
	state: AudioContextState = 'running';
	currentTime = 0;
	destination = {} as AudioDestinationNode;
	createGain = vi.fn(() => ({
		gain: { value: 1, setTargetAtTime: vi.fn() },
		connect: vi.fn(),
		disconnect: vi.fn(),
	}));

	createAnalyser = vi.fn(() => ({ fftSize: 2048, connect: vi.fn(), disconnect: vi.fn() }));
	createMediaElementSource = vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn() }));
}

interface FakeHlsInstance {
	destroy: ReturnType<typeof vi.fn>;
	stopLoad: ReturnType<typeof vi.fn>;
}

describe('WebAudioBackend HLS crossfade ownership', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		document.body.innerHTML = '';
		vi.restoreAllMocks();
	});

	it('promotes the secondary HLS handle and destroys the old one', async () => {
		vi.stubGlobal('AudioContext', MockAudioContext);
		const hls = (await import('hls.js')).default as unknown as { instances: FakeHlsInstance[] };
		hls.instances.length = 0;
		const container = document.createElement('div');
		document.body.appendChild(container);
		const context = new MockAudioContext() as unknown as AudioContext;
		const backend = new WebAudioBackend(container, { audioContext: context });
		const loadingPrimary = backend.load('https://media.example.test/a.m3u8');
		await vi.waitFor(() => expect(hls.instances).toHaveLength(1));
		backend.mediaElement().dispatchEvent(new Event('loadedmetadata'));
		await loadingPrimary;

		const loadingSecondary = backend.loadSecondary('https://media.example.test/b.m3u8');
		await vi.waitFor(() => expect(hls.instances).toHaveLength(2));
		const secondary = container.querySelectorAll('audio')[1]!;
		secondary.dispatchEvent(new Event('loadedmetadata'));
		await loadingSecondary;
		vi.spyOn(secondary, 'play').mockResolvedValue(undefined);
		await backend.crossfade(0);
		backend.pauseLoader();

		expect(hls.instances[0]!.destroy).toHaveBeenCalledOnce();
		expect(hls.instances[1]!.stopLoad).toHaveBeenCalledOnce();
		backend.dispose();
	});

	it('destroys an HLS handle when the secondary is discarded', async () => {
		vi.stubGlobal('AudioContext', MockAudioContext);
		const hls = (await import('hls.js')).default as unknown as { instances: FakeHlsInstance[] };
		hls.instances.length = 0;
		const container = document.createElement('div');
		document.body.appendChild(container);
		const backend = new WebAudioBackend(container);
		const loading = backend.loadSecondary('https://media.example.test/next.m3u8');
		await vi.waitFor(() => expect(hls.instances).toHaveLength(1));
		container.querySelectorAll('audio')[1]!.dispatchEvent(new Event('loadedmetadata'));
		await loading;

		backend.disposeSecondary();
		expect(hls.instances[0]!.destroy).toHaveBeenCalledOnce();
		backend.dispose();
	});
});
