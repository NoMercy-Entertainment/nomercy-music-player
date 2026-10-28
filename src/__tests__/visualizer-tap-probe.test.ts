import { AudioGraphPlugin, CanvasPlugin, SpectrumPlugin } from '@nomercy-entertainment/nomercy-player-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebAudioBackend } from '../adapters/audio-backend/web-audio';
import { NMMusicPlayer } from '../index';

class N {
	targets = new Set<unknown>();
	connect = vi.fn((t: unknown) => { this.targets.add(t); return t; });
	disconnect = vi.fn((t?: unknown) => { if (t) this.targets.delete(t); else this.targets.clear(); });
}
class G extends N {
	gain = { value: 1, setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn(), setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), setValueCurveAtTime: vi.fn() };
}
class A extends N {
	fftSize = 2048;
	smoothingTimeConstant = 0;
	frequencyBinCount = 1024;
	getByteFrequencyData = vi.fn();
	getByteTimeDomainData = vi.fn();
	getFloatFrequencyData = vi.fn();
	getFloatTimeDomainData = vi.fn();
}
class Ctx {
	state = 'running';
	currentTime = 0;
	sampleRate = 44100;
	destination = new N();
	sources: N[] = [];
	analysers: A[] = [];
	createGain = () => new G();
	createAnalyser = () => { const a = new A(); this.analysers.push(a); return a; };
	createMediaElementSource = () => { const s = new N(); this.sources.push(s); return s; };
	createChannelSplitter = () => new N();
	resume = vi.fn(() => Promise.resolve());
}

function last(c: HTMLElement): HTMLAudioElement {
	const a = c.querySelectorAll('audio');
	return a[a.length - 1] as HTMLAudioElement;
}

describe('probe', () => {
	let ctx: Ctx;
	beforeEach(() => {
		(globalThis as any).AudioContext = function () { ctx = new Ctx(); return ctx; };
		(NMMusicPlayer as any)._resetRegistry();
	});
	afterEach(() => { delete (globalThis as any).AudioContext; document.body.innerHTML = ''; });

	it('spectrum analyser is fed by the playing element source after a swap', async () => {
		const div = document.createElement('div');
		div.id = 'p';
		document.body.appendChild(div);
		const player = new NMMusicPlayer('p');
		player.setup({ backend: 'webaudio' });
		await player.ready();
		const mount = document.createElement('div');
		player.addPlugin(AudioGraphPlugin);
		player.addPlugin(SpectrumPlugin, { fftSize: 2048 } as any);
		player.addPlugin(CanvasPlugin, { mount, fps: 60 } as any);
		await new Promise(r => setTimeout(r, 50));
		console.log('plugins', player.getPlugin(AudioGraphPlugin) != null, player.getPlugin(SpectrumPlugin) != null, player.getPlugin(CanvasPlugin) != null);
		const spectrum = player.getPlugin(SpectrumPlugin)!;
		const an = spectrum.analyser() as unknown as A;
		const feeders = () => ctx.sources.filter(s => s.targets.has(an));
		console.log('sources', ctx.sources.length, 'feeders', feeders().length);
		expect(feeders().length).toBe(1);

		const backend = player.backend() as WebAudioBackend;
		const lp = backend.loadSecondary('http://test/n.mp3');
		last(div).dispatchEvent(new Event('loadedmetadata'));
		await lp;
		const pp = backend.primeSecondary();
		last(div).dispatchEvent(new Event('canplay'));
		await pp;
		div.querySelectorAll('audio').forEach((e) => { Object.defineProperty(e, 'play', { value: () => Promise.resolve(), configurable: true }); });
		await backend.crossfade(0);
		const newSource = ctx.sources[ctx.sources.length - 1]!;
		console.log('after swap feeders', feeders().length, 'newSource feeds', newSource.targets.has(an));
		expect(newSource.targets.has(an)).toBe(true);
	});
});
