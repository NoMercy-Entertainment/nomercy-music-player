import { AudioGraphPlugin, CanvasPlugin, SpectrumPlugin, VisualizationPlugin } from '@nomercy-entertainment/nomercy-player-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
	sources: N[] = [];
	createGain = () => new G();
	createAnalyser = () => new A();
	createMediaElementSource = () => { const s = new N(); this.sources.push(s); return s; };
	createChannelSplitter = () => new N();
	resume = vi.fn(() => Promise.resolve());
}

const renders = vi.fn();
class Probe extends VisualizationPlugin {
	static override readonly id = 'probe:viz';
	static override readonly version = '1.0.0';
	protected override render(_ctx: CanvasRenderingContext2D, frame: { frequency: Uint8Array }): void {
		renders(frame.frequency[0]);
	}
}

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

describe('probe2', () => {
	beforeEach(() => {
		(globalThis as any).AudioContext = function () { return new Ctx(); };
		(HTMLCanvasElement.prototype as any).getContext = () => ({ clearRect: vi.fn(), fillRect: vi.fn() });
		(NMMusicPlayer as any)._resetRegistry();
		renders.mockClear();
	});
	afterEach(() => { delete (globalThis as any).AudioContext; document.body.innerHTML = ''; });

	it('renders after mount, after stop, and after remount', async () => {
		const div = document.createElement('div');
		div.id = 'p2';
		document.body.appendChild(div);
		const player = new NMMusicPlayer('p2');
		player.setup({ backend: 'webaudio' });
		await player.ready();
		const mount = document.createElement('div');
		document.body.appendChild(mount);
		const failed: unknown[] = [];
		(player.on as any)('plugin:failed', (e: unknown) => failed.push(e));

		player.addPlugin(AudioGraphPlugin);
		player.addPlugin(SpectrumPlugin, { fftSize: 2048 } as any);
		player.addPlugin(CanvasPlugin, { mount, fps: 60 } as any);
		player.addPlugin(Probe);
		await wait(300);
		console.log('R1 renders', renders.mock.calls.length, 'failed', failed.length);
		expect(renders.mock.calls.length).toBeGreaterThan(0);

		player.backend()!.stop();
		renders.mockClear();
		await wait(200);
		console.log('R2 after stop', renders.mock.calls.length);
		expect(renders.mock.calls.length).toBeGreaterThan(0);

		player.removePlugin(Probe);
		player.removePlugin(CanvasPlugin);
		player.removePlugin(SpectrumPlugin);
		await wait(50);
		player.addPlugin(SpectrumPlugin, { fftSize: 2048 } as any);
		player.addPlugin(CanvasPlugin, { mount, fps: 60 } as any);
		player.addPlugin(Probe);
		renders.mockClear();
		await wait(300);
		console.log('R3 after remount', renders.mock.calls.length, 'failed', failed.length);
		expect(renders.mock.calls.length).toBeGreaterThan(0);
	});
});
