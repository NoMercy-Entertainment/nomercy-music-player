import { AudioGraphPlugin, CanvasPlugin, SpectrumPlugin, VisualizationPlugin } from '@nomercy-entertainment/nomercy-player-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NMMusicPlayer } from '../index';

class N {
	connect = vi.fn((t: unknown) => t);
	disconnect = vi.fn();
}
class G extends N {
	gain = { value: 1, setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn(), setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), setValueCurveAtTime: vi.fn() };
}
class A extends N {
	fftSize = 2048;
	smoothingTimeConstant = 0;
	frequencyBinCount = 1024;
	getByteFrequencyData = vi.fn((b: Uint8Array) => { b.fill(100); });
	getByteTimeDomainData = vi.fn();
	getFloatFrequencyData = vi.fn();
	getFloatTimeDomainData = vi.fn();
}
class Ctx {
	state = 'running';
	currentTime = 0;
	sampleRate = 44100;
	destination = new N();
	createGain = () => new G();
	createAnalyser = () => new A();
	createMediaElementSource = () => new N();
	createChannelSplitter = () => new N();
	resume = vi.fn(() => Promise.resolve());
}

const renders = vi.fn();
class Probe extends VisualizationPlugin {
	static override readonly id = 'probe:viz3';
	static override readonly version = '1.0.0';
	protected override render(): void {
		renders();
	}
}

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

describe('probe3: plugins added at every point of setup', () => {
	beforeEach(() => {
		(globalThis as any).AudioContext = function () { return new Ctx(); };
		(HTMLCanvasElement.prototype as any).getContext = () => ({ clearRect: vi.fn(), fillRect: vi.fn() });
		(NMMusicPlayer as any)._resetRegistry();
		renders.mockClear();
	});
	afterEach(() => { delete (globalThis as any).AudioContext; document.body.innerHTML = ''; });

	it('shows at which microtask the phase turns ready', async () => {
		const div = document.createElement('div');
		div.id = 'p3-t';
		document.body.appendChild(div);
		const player = new NMMusicPlayer('p3-t');
		player.setup({ backend: 'webaudio' });
		let at = -1;
		for (let i = 0; i < 200 && at < 0; i++) {
			await Promise.resolve();
			if (player.phase() === 'ready')
				at = i;
		}
		console.log('READY AT MICROTASK', at);
	});

	for (const ticks of [0, 1, 2, 3, 5, 8, 13, 21]) {
		it(`registers and renders when added after ${ticks} microtasks`, async () => {
			const div = document.createElement('div');
			div.id = `p3-${ticks}`;
			document.body.appendChild(div);
			const player = new NMMusicPlayer(`p3-${ticks}`);
			player.setup({ backend: 'webaudio' });
			const phases: string[] = [];
			let clock = 0;
			let counting = true;
			void (async () => { while (counting && clock < 100) { await Promise.resolve(); clock++; } })();
			(player.on as any)('phase', (e: any) => phases.push(`${e.from}>${e.to}@${clock}`));
			(player.on as any)('plugin:failed', (e: any) => console.log('FAILED', JSON.stringify(e?.error?.code ?? e?.id ?? e)));
			console.log('phase after setup', player.phase());
			for (let i = 0; i < ticks; i++)
				await Promise.resolve();
			const mount = document.createElement('div');
			document.body.appendChild(mount);
			phases.push(`add@${clock} phase=${player.phase()}`);
			player.addPlugin(AudioGraphPlugin);
			player.addPlugin(SpectrumPlugin, { fftSize: 2048 } as any);
			player.addPlugin(CanvasPlugin, { mount, fps: 60 } as any);
			player.addPlugin(Probe);
			await wait(300);
			const have = [AudioGraphPlugin, SpectrumPlugin, CanvasPlugin, Probe].map(c => player.getPlugin(c as any) != null);
			console.log(`phases ${phases.join(' ')} queue=${(player as any)._pluginQueue?.length} plugins=${(player as any)._plugins?.map((p: any) => p.ctor.id).join(',')}`);
			console.log(`ticks=${ticks} phase=${player.phase()} plugins=${have.join(',')} renders=${renders.mock.calls.length}`);
			expect(have).toEqual([true, true, true, true]);
			expect(renders.mock.calls.length).toBeGreaterThan(0);
		});
	}
});
