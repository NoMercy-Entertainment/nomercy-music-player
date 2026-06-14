/**
 * Single AudioContext invariant — regression suite for Bug 1 (total silence).
 *
 * Root cause: WebAudioBackend created its own AudioContext (A) at construction
 * time but never registered it on the player. AudioGraphPlugin.use() found
 * player.audioContext() === undefined, created a second context (B), and then
 * tried to connect backend nodes (context A) to plugin chain nodes (context B).
 * Chrome threw InvalidAccessError on the cross-context connect, caught it, and
 * aborted the chain — leaving the source routed to nothing.
 *
 * Fix: _wireBackend() calls setPlayerAudioContext(player, backend.audioContext())
 * immediately after creation, before any plugin's use() runs.
 *
 * What these tests verify:
 *   1. After wiring a WebAudioBackend, player.audioContext() returns the
 *      backend's context, not undefined and not a different object.
 *   2. When AudioGraphPlugin.use() runs next it reuses that context — only
 *      one AudioContext is ever created across backend + plugin.
 *   3. All graph nodes (backend source, plugin effects) share the same context
 *      — cross-context connect is structurally impossible.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioGraphPlugin } from '@nomercy-entertainment/nomercy-player-core';
import { NMMusicPlayer } from '../index';
import { WebAudioBackend } from '../adapters/audio-backend/web-audio';

// ── AudioContext stub ──────────────────────────────────────────────────────────

class MockGainNode {
	gain = { value: 1, setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn(), setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() };
	connect = vi.fn();
	disconnect = vi.fn();
}

class MockAnalyserNode {
	fftSize = 2048;
	smoothingTimeConstant = 0;
	connect = vi.fn();
	disconnect = vi.fn();
}

class MockSourceNode {
	connect = vi.fn();
	disconnect = vi.fn();
}

class MockAudioContext {
	static instances: MockAudioContext[] = [];

	state: AudioContextState = 'running';
	currentTime = 0;
	destination = { connect: vi.fn() } as unknown as AudioDestinationNode;
	sampleRate = 44100;

	createGain = vi.fn((): MockGainNode => new MockGainNode());
	createAnalyser = vi.fn((): MockAnalyserNode => new MockAnalyserNode());
	createMediaElementSource = vi.fn((): MockSourceNode => new MockSourceNode());
	resume = vi.fn((): Promise<void> => Promise.resolve());

	constructor() {
		MockAudioContext.instances.push(this);
	}
}

function installAudioContext(): void {
	MockAudioContext.instances = [];
	(globalThis as unknown as { AudioContext: typeof MockAudioContext }).AudioContext = MockAudioContext;
}

function removeAudioContext(): void {
	delete (globalThis as unknown as { AudioContext?: unknown }).AudioContext;
	MockAudioContext.instances = [];
}

function makePlayer(): NMMusicPlayer {
	const div = document.createElement('div');
	div.id = `p-${Math.random().toString(36).slice(2)}`;
	document.body.appendChild(div);
	const player = new NMMusicPlayer(div.id);
	player.setup({ backend: 'webaudio' });
	return player;
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('single AudioContext invariant (Bug 1 regression)', () => {
	beforeEach(() => {
		installAudioContext();
		(NMMusicPlayer as unknown as { _resetRegistry(): void })._resetRegistry();
	});

	afterEach(() => {
		(NMMusicPlayer as unknown as { _resetRegistry(): void })._resetRegistry();
		removeAudioContext();
		document.body.innerHTML = '';
	});

	it('player.audioContext() returns the backend context immediately after backend creation', () => {
		const player = makePlayer();

		// Force backend creation (lazy getter).
		const backend = player.backend() as WebAudioBackend;

		expect(typeof backend.audioContext).toBe('function');
		const backendCtx = backend.audioContext();
		const playerCtx = player.audioContext();

		expect(playerCtx).toBeDefined();
		expect(playerCtx).toBe(backendCtx);
	});

	it('exactly one AudioContext is created across backend + AudioGraphPlugin', async () => {
		const player = makePlayer();

		// Force backend creation.
		player.backend();

		// Add AudioGraphPlugin — it must reuse the existing context.
		player.addPlugin(AudioGraphPlugin);
		await player.ready();

		// Only one AudioContext instance should exist — the backend's.
		expect(MockAudioContext.instances).toHaveLength(1);
	});

	it('AudioGraphPlugin.context() is the same object as player.audioContext()', async () => {
		const player = makePlayer();
		player.backend();
		player.addPlugin(AudioGraphPlugin);
		await player.ready();

		const pluginInstance = player.getPlugin(AudioGraphPlugin)!;
		expect(pluginInstance).toBeDefined();

		const pluginCtx = pluginInstance.context();
		const playerCtx = player.audioContext();

		expect(pluginCtx).toBe(playerCtx);
	});

	it('backend source node and plugin chain live in the same AudioContext', async () => {
		const player = makePlayer();
		const backend = player.backend() as WebAudioBackend;
		player.addPlugin(AudioGraphPlugin);
		await player.ready();

		const backendCtx = backend.audioContext();
		const pluginInstance = player.getPlugin(AudioGraphPlugin)!;
		const pluginCtx = pluginInstance.context();

		// Both contexts must be the same object — cross-context connect is
		// structurally impossible when this holds.
		expect(backendCtx).toBe(pluginCtx);

		// The source node returned by the backend was created in backendCtx.
		expect(backendCtx.createMediaElementSource).toHaveBeenCalled();
	});
});
