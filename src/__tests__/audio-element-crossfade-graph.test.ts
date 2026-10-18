import { afterEach, describe, expect, it, vi } from 'vitest';
import { AudioElementBackend } from '../adapters/audio-backend/html5-audio';

class MockAudioContext {
	destination = {} as AudioDestinationNode;
	createMediaElementSource = vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn() }));
	createAnalyser = vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn() }));
	createGain = vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn() }));
}

describe('AudioElementBackend graph after crossfade', () => {
	afterEach(() => {
		document.body.innerHTML = '';
		vi.restoreAllMocks();
	});

	it('rebuilds the graph on the promoted element and emits a source swap', async () => {
		const container = document.createElement('div');
		document.body.appendChild(container);
		const backend = new AudioElementBackend(container);
		const context = new MockAudioContext() as unknown as AudioContext;
		const oldOutput = backend.outputNode(context);
		const swaps: AudioNode[] = [];
		backend.on('backend:sourceswap', payload => swaps.push(payload.sourceNode));

		const loading = backend.loadSecondary('https://media.example.test/next.mp3');
		const secondary = container.querySelectorAll('audio')[1]!;
		secondary.dispatchEvent(new Event('loadedmetadata'));
		await loading;
		vi.spyOn(secondary, 'play').mockResolvedValue(undefined);
		await backend.crossfade(0);

		expect(context.createMediaElementSource).toHaveBeenLastCalledWith(secondary);
		expect(context.createMediaElementSource).toHaveBeenCalledTimes(2);
		expect(backend.outputNode(context)).not.toBe(oldOutput);
		expect(swaps).toEqual([backend.outputNode(context)]);
		backend.dispose();
	});
});
