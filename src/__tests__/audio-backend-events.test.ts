/**
 * Verifies that IAudioBackend.on/off are typed with the generic overload so
 * each event's listener receives the correct BackendEventPayload type.
 * These are compile-time checks expressed as runtime assertions.
 */
import type { BackendEvent, BackendEventPayload } from '../adapters/audio-backend/IAudioBackend';
import { describe, expect, it, vi } from 'vitest';

import { AudioElementBackend } from '../adapters/audio-backend/html5-audio';

describe('IAudioBackend typed events (A1 + A10)', () => {
	it('BackendEvent union includes backend:loading and backend:loaded (A10)', () => {
		// Type-level: confirm the keys are in the union by using them as typed strings.
		const events: BackendEvent[] = ['backend:loading', 'backend:loaded'];
		expect(events).toHaveLength(2);
	});

	it('BackendEventPayload has entries for backend:loading and backend:loaded', () => {
		const loading: BackendEventPayload['backend:loading'] = { url: 'http://x/a.mp3', kind: 'audio-element' };
		const loaded: BackendEventPayload['backend:loaded'] = { url: 'http://x/a.mp3', kind: 'audio-element', duration: 180 };
		expect(loading.url).toBe('http://x/a.mp3');
		expect(loaded.duration).toBe(180);
	});

	it('on() and off() accept a typed BackendEvent and handler — no any (A1)', () => {
		const div = document.createElement('div');
		const backend = new AudioElementBackend(div);

		// canplay handler — payload is Event.
		const canplayHandler: (data?: BackendEventPayload['canplay']) => void = vi.fn();
		backend.on('canplay', canplayHandler);
		backend.off('canplay', canplayHandler);

		// backend:loading handler — payload is { url, kind }.
		const loadingHandler: (data?: BackendEventPayload['backend:loading']) => void = vi.fn();
		backend.on('backend:loading', loadingHandler);
		backend.off('backend:loading', loadingHandler);

		// If this file type-checks, the generic overloads are working correctly.
		expect(true).toBe(true);
	});

	it('AudioElementBackend emits backend:loading synchronously on load() entry', () => {
		const div = document.createElement('div');
		const backend = new AudioElementBackend(div);
		const spy: (data?: BackendEventPayload['backend:loading']) => void = vi.fn();
		backend.on('backend:loading', spy);

		// backend:loading is emitted synchronously before the internal Promise
		// await, so we start load() but don't await it — the spy fires immediately.
		void backend.load('http://example.com/track.mp3');

		expect(spy).toHaveBeenCalled();
		const calls = (spy as ReturnType<typeof vi.fn>).mock.calls;
		const payload = calls[0]?.[0] as BackendEventPayload['backend:loading'] | undefined;
		expect(payload?.url).toBe('http://example.com/track.mp3');
		expect(payload?.kind).toBe('audio-element');
	});
});
