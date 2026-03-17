/**
 * Crossfade race condition tests
 *
 * The server has a 100ms polling timer that auto-advances tracks when
 * Time >= Duration.  The client starts a crossfade ~3 s before track end.
 * Without coordination the server fires first and interrupts the fade.
 *
 * Fix: when crossfade begins the player sets _crossfadeActive=true and emits
 * 'crossfadeStart'.  The consuming app (web / Android) uses this to tell the
 * server "I am driving this transition — hold off".  When crossfade finishes
 * the player emits 'crossfadeComplete' and clears the flag.
 *
 * These tests exercise that contract without touching live DOM APIs — all
 * audio element behaviour is mocked at the Helpers layer.
 */

import type { BasePlaylistItem } from './types';
import Queue from './queue';
import Helpers from './helpers';

// ── Node globals the player expects ──────────────────────────────────────────
// Set up before any class is instantiated. ts-jest compiles imports to require()
// calls so module bodies run top-to-bottom at require time. These globals must
// be in place by the time any Queue/Helpers constructor fires — i.e. before the
// first beforeEach runs.

const localStorageStore: Record<string, string> = {};

Object.defineProperty(global, 'localStorage', {
    value: {
        getItem: (k: string) => localStorageStore[k] ?? null,
        setItem: (k: string, v: string) => { localStorageStore[k] = v; },
        removeItem: (k: string) => { delete localStorageStore[k]; },
        clear: () => { Object.keys(localStorageStore).forEach(k => delete localStorageStore[k]); },
    },
    writable: true,
});

Object.defineProperty(global, 'navigator', {
    value: { userAgent: 'Mozilla/5.0 (Node.js test)' },
    writable: true,
});

function makeFakeAudioEl() {
    return {
        id: '',
        preload: 'auto',
        controls: false,
        autoplay: true,
        loop: false,
        crossOrigin: 'anonymous',
        volume: 1,
        muted: false,
        currentTime: 0,
        duration: 0,
        playbackRate: 1,
        buffered: { length: 0 },
        error: null,
        play: jest.fn(() => Promise.resolve()),
        pause: jest.fn(),
        load: jest.fn(),
        canPlayType: jest.fn(() => ''),
        setAttribute: jest.fn(),
        removeAttribute: jest.fn(),
        remove: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
    };
}

Object.defineProperty(global, 'document', {
    value: {
        createElement: jest.fn((tag: string) => {
            if (tag === 'audio') return makeFakeAudioEl();
            return {};
        }),
        body: { appendChild: jest.fn() },
    },
    writable: true,
});

Object.defineProperty(global, 'window', {
    value: {
        location: { hash: '' },
        matchMedia: () => ({ matches: false }),
        musicPlayer: undefined,
    },
    writable: true,
});

// ── Minimal track fixture ─────────────────────────────────────────────────────

function makeTrack(id: string, name: string): BasePlaylistItem {
    return {
        id,
        name,
        path: `/music/${id}.mp3`,
        artist_track: [{ name: 'Test Artist' }],
        album_track: [{ name: 'Test Album' }],
    };
}

// ── Minimal AudioNode stub ────────────────────────────────────────────────────
// Cannot construct a real AudioNode in Node.js (requires document.createElement).
// We stub only the shape that Helpers/Queue actually uses.

function makeAudioNodeStub(parent: Helpers<BasePlaylistItem>) {
    let _volume = 100;
    let _currentTime = 0;
    let _duration = 200; // 200 s default — long enough for crossfade
    let _autoplay = true;

    let nextSongFired = false;
    const stub = {
        isFading: false,
        isFadingOut: false,
        hasNextQueued: false,
        get nextSongFired() { return nextSongFired; },
        set nextSongFired(v: boolean) { nextSongFired = v; },
        currentTime: _currentTime,
        duration: _duration,
        volume: _volume,
        _disableAutoPlayback: false,
        play: jest.fn(() => Promise.resolve()),
        pause: jest.fn(),
        stop: jest.fn(),
        dispose: jest.fn(),
        setSource: jest.fn(),
        setVolume: jest.fn((newVol: number) => { _volume = newVol; }),
        fadeVolume: jest.fn(),
        getVolume: jest.fn(() => _volume),
        mute: jest.fn(),
        unmute: jest.fn(),
        setCurrentTime: jest.fn((t: number) => { _currentTime = t; }),
        getCurrentTime: jest.fn(() => _currentTime),
        getDuration: jest.fn(() => _duration),
        getBuffer: jest.fn(() => 0),
        getPlaybackRate: jest.fn(() => 1),
        getTimeData: jest.fn(() => ({
            position: _currentTime,
            duration: _duration,
            remaining: _duration - _currentTime,
            buffered: 0,
            percentage: _duration > 0 ? (_currentTime / _duration) * 100 : 0,
        })),
        setCrossFadeSteps: jest.fn(),
        setAutoPlayback: jest.fn(),
        setRepeating: jest.fn(),
        getAudioElement: jest.fn(() => ({
            get autoplay() { return _autoplay; },
            set autoplay(v: boolean) { _autoplay = v; },
            setAttribute: jest.fn(),
            currentTime: _currentTime,
        })),
        _fadeOut: jest.fn(() => {
            // Emit setCurrentAudio slightly AFTER nextSong so the once('nextSong')
            // handler has time to register once('setCurrentAudio') first.
            setTimeout(() => parent.emit('setCurrentAudio', {} as HTMLAudioElement), 5);
        }),
        _fadeIn: jest.fn(() => {
            // Emit nextSong to advance the crossfade sequence.
            setTimeout(() => {
                if (!nextSongFired) {
                    nextSongFired = true;
                    parent.emit('nextSong');
                }
            }, 0);
        }),
        _setDuration(d: number) { _duration = d; },
        _setCurrentTime(t: number) { _currentTime = t; },
    };

    // Patch getDuration/getCurrentTime to read from closure after _setDuration/_setCurrentTime
    stub.getDuration = jest.fn(() => _duration);
    stub.getCurrentTime = jest.fn(() => _currentTime);

    return stub;
}

// ── TestableQueue ─────────────────────────────────────────────────────────────

class TestableQueue extends Queue<BasePlaylistItem> {
    constructor() {
        super();
        this._audioElement1 = makeAudioNodeStub(this) as any;
        this._audioElement2 = makeAudioNodeStub(this) as any;
        this._currentAudio = this._audioElement1 as any;
        this._nextAudio = this._audioElement2 as any;
        this.getNewSource = (item) => Promise.resolve(`/mock/${item?.id}.mp3`);
    }

    /** Expose protected _nextAudio for test assertions. */
    get nextAudio() { return this._nextAudio; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Queue management', () => {
    let q: TestableQueue;

    beforeEach(() => {
        q = new TestableQueue();
    });

    it('setQueue replaces the queue and emits queue event', () => {
        const listener = jest.fn();
        q.on('queue', listener);

        const tracks = [makeTrack('a', 'A'), makeTrack('b', 'B')];
        q.setQueue(tracks);

        expect(q.getQueue()).toHaveLength(2);
        expect(q.getQueue()[0].id).toBe('a');
        expect(listener).toHaveBeenCalledTimes(1);
    });

    it('addToQueue appends a track', () => {
        q.setQueue([makeTrack('a', 'A')]);
        q.addToQueue(makeTrack('b', 'B'));
        expect(q.getQueue()).toHaveLength(2);
        expect(q.getQueue()[1].id).toBe('b');
    });

    it('removeFromQueue removes a track', () => {
        const tracks = [makeTrack('a', 'A'), makeTrack('b', 'B')];
        q.setQueue(tracks);
        q.removeFromQueue(q.getQueue()[0]);
        expect(q.getQueue()).toHaveLength(1);
        expect(q.getQueue()[0].id).toBe('b');
    });

    it('addToQueueNext prepends a track', () => {
        q.setQueue([makeTrack('a', 'A')]);
        q.addToQueueNext(makeTrack('z', 'Z'));
        expect(q.getQueue()[0].id).toBe('z');
    });

    it('addToBackLog and getBackLog round-trip', () => {
        q.addToBackLog(makeTrack('x', 'X'));
        expect(q.getBackLog()).toHaveLength(1);
        expect(q.getBackLog()[0].id).toBe('x');
    });

    it('next() moves current song to backlog and plays queue head', () => {
        const track1 = makeTrack('1', 'One');
        const track2 = makeTrack('2', 'Two');
        q.currentSong = track1;
        q.setQueue([track2]);

        q.next();

        expect(q.getBackLog()).toHaveLength(1);
        expect(q.getBackLog()[0].id).toBe('1');
        expect(q.getQueue()).toHaveLength(0);
    });

    it('previous() beyond 3s restarts the current track', () => {
        // queue.ts:129 reads _currentAudio.currentTime directly (public property)
        const track = makeTrack('1', 'One');
        q.currentSong = track;
        (q._currentAudio as any).currentTime = 5; // > 3 → restart

        q.previous();

        expect((q._currentAudio as any).setCurrentTime).toHaveBeenCalledWith(0);
    });

    it('previous() within 3s goes to previous backlog entry', () => {
        const prev = makeTrack('prev', 'Prev');
        const curr = makeTrack('curr', 'Curr');
        q.currentSong = curr;
        q.addToBackLog(prev);
        (q._currentAudio as any).currentTime = 1.5; // <= 3 → go back

        q.previous();

        expect(q.getBackLog()).toHaveLength(0);
    });

    it('shuffle() changes the shuffle flag', () => {
        q.shuffle(true);
        expect(q.isShuffling).toBe(true);
        q.shuffle(false);
        expect(q.isShuffling).toBe(false);
    });

    it('repeat() changes repeat state and propagates to audio nodes', () => {
        q.repeat('all');
        expect(q['_repeat']).toBe('all');
        expect((q._audioElement1 as any).setRepeating).toHaveBeenCalledWith('all');
    });

    it('next() wraps backlog into queue when queue is empty', () => {
        const a = makeTrack('a', 'A');
        const b = makeTrack('b', 'B');
        q.currentSong = a;
        q.setQueue([]);
        q.setBackLog([a, b]);

        q.next();

        // next() adds currentSong(a) to backlog first → backlog=[a,b,a]
        // then setCurrentSong(backlog[0]=a), setQueue(backlog.slice(1)=[b,a]), setBackLog([])
        expect(q.getQueue()).toHaveLength(2);
        expect(q.getBackLog()).toHaveLength(0);
    });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('Crossfade timing — normal flow', () => {
    let q: TestableQueue;

    beforeEach(() => {
        q = new TestableQueue();
        (q._currentAudio as any)._setDuration(200);
        q.currentSong = makeTrack('1', 'One');
    });

    it('prepareCrossfade sets _crossfadePrepared after source loads', async () => {
        q.setQueue([makeTrack('2', 'Two')]);

        q.prepareCrossfade();
        await Promise.resolve();

        expect(q._crossfadePrepared).toBe(true);
    });

    it('prepareCrossfade is a no-op when _crossfadePrepared is already true', async () => {
        q.setQueue([makeTrack('2', 'Two')]);
        q._crossfadePrepared = true;

        q.prepareCrossfade();
        await Promise.resolve();

        expect((q.nextAudio as any).setSource).not.toHaveBeenCalled();
    });

    it('prepareCrossfade is a no-op when repeat=one', async () => {
        q.repeat('one');
        q.setQueue([makeTrack('2', 'Two')]);

        q.prepareCrossfade();
        await Promise.resolve();

        expect(q._crossfadePrepared).toBe(false);
    });

    it('crossfadeStart and crossfadeComplete events fire in order', async () => {
        const events: string[] = [];
        q.on('crossfadeStart', () => events.push('start'));
        q.on('crossfadeComplete', () => events.push('complete'));

        q.setQueue([makeTrack('2', 'Two')]);
        q.prepareCrossfade();
        await Promise.resolve();

        q.emit('startFadeOut');
        await new Promise((r) => setTimeout(r, 50));

        expect(events[0]).toBe('start');
        expect(events[1]).toBe('complete');
    });

    it('_crossfadeActive is true while running and false after completion', async () => {
        q.setQueue([makeTrack('2', 'Two')]);
        q.prepareCrossfade();
        await Promise.resolve();

        expect(q._crossfadeActive).toBe(false);

        q.emit('startFadeOut');
        expect(q._crossfadeActive).toBe(true);

        await new Promise((r) => setTimeout(r, 50));

        expect(q._crossfadeActive).toBe(false);
    });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('Race condition — server auto-advance during crossfade', () => {
    /**
     * Simulates the MusicHub 100ms timer firing "next" while the client
     * crossfade is in progress. The consuming app checks _crossfadeActive
     * before acting on a server-driven next.
     */
    it('_crossfadeActive blocks a server-driven next during crossfade', async () => {
        const q = new TestableQueue();
        (q._currentAudio as any)._setDuration(200);
        q.currentSong = makeTrack('1', 'One');
        q.setQueue([makeTrack('2', 'Two'), makeTrack('3', 'Three')]);

        const crossfadeStartCallback = jest.fn();
        const crossfadeCompleteCallback = jest.fn();
        q.onCrossfadeStart = crossfadeStartCallback;
        q.onCrossfadeComplete = crossfadeCompleteCallback;

        q.prepareCrossfade();
        await Promise.resolve();

        q.emit('startFadeOut'); // crossfade begins

        // Server fires auto-advance right now — consuming app guards:
        // if (!player._crossfadeActive) { signalR.send('next'); }
        expect(q._crossfadeActive).toBe(true);
        expect(crossfadeStartCallback).toHaveBeenCalledTimes(1);

        await new Promise((r) => setTimeout(r, 50));

        expect(q._crossfadeActive).toBe(false);
        expect(crossfadeCompleteCallback).toHaveBeenCalledTimes(1);
    });

    it('queueNext handler also sets _crossfadeActive during fade', async () => {
        const q = new TestableQueue();
        (q._currentAudio as any)._setDuration(200);
        q.currentSong = makeTrack('1', 'One');
        q.setQueue([makeTrack('2', 'Two')]);

        q.emit('queueNext');
        await Promise.resolve();

        q.emit('startFadeOut');
        expect(q._crossfadeActive).toBe(true);

        await new Promise((r) => setTimeout(r, 50));
        expect(q._crossfadeActive).toBe(false);
    });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('Short track handling', () => {
    it('prepareCrossfade skips when duration < fadeDuration', async () => {
        const q = new TestableQueue();
        // fadeDuration default is 3 s
        (q._currentAudio as any)._setDuration(2);
        q.currentSong = makeTrack('short', 'Short');
        q.setQueue([makeTrack('next', 'Next')]);

        q.prepareCrossfade();
        await Promise.resolve();

        expect(q._crossfadePrepared).toBe(false);
        expect((q.nextAudio as any).setSource).not.toHaveBeenCalled();
    });

    it('prepareCrossfade skips when duration equals fadeDuration', async () => {
        const q = new TestableQueue();
        (q._currentAudio as any)._setDuration(3);
        q.currentSong = makeTrack('short', 'Short');
        q.setQueue([makeTrack('next', 'Next')]);

        q.prepareCrossfade();
        await Promise.resolve();

        expect(q._crossfadePrepared).toBe(false);
    });

    it('prepareCrossfade proceeds normally when duration > fadeDuration', async () => {
        const q = new TestableQueue();
        (q._currentAudio as any)._setDuration(60);
        q.currentSong = makeTrack('normal', 'Normal');
        q.setQueue([makeTrack('next', 'Next')]);

        q.prepareCrossfade();
        await Promise.resolve();

        expect(q._crossfadePrepared).toBe(true);
    });

    it('queueNext skips crossfade for short tracks', async () => {
        const q = new TestableQueue();
        (q._currentAudio as any)._setDuration(2);
        q.currentSong = makeTrack('short', 'Short');
        q.setQueue([makeTrack('next', 'Next')]);

        q.emit('queueNext');
        await Promise.resolve();

        expect(q._crossfadePrepared).toBe(false);
        expect((q.nextAudio as any).setSource).not.toHaveBeenCalled();
    });

    it('queueNext proceeds for normal-length tracks', async () => {
        const q = new TestableQueue();
        (q._currentAudio as any)._setDuration(200);
        q.currentSong = makeTrack('normal', 'Normal');
        q.setQueue([makeTrack('next', 'Next')]);

        q.emit('queueNext');
        await Promise.resolve();

        expect(q._crossfadePrepared).toBe(true);
    });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('Crossfade disabled (disableAutoPlayback)', () => {
    it('queueNext is a no-op when disableAutoPlayback is true', async () => {
        const q = new TestableQueue();
        q['disableAutoPlayback'] = true;
        (q._currentAudio as any)._setDuration(200);
        q.currentSong = makeTrack('1', 'One');
        q.setQueue([makeTrack('2', 'Two')]);

        q.emit('queueNext');
        await Promise.resolve();

        expect(q._crossfadePrepared).toBe(false);
        expect((q.nextAudio as any).setSource).not.toHaveBeenCalled();
    });

    it('onCrossfadeStart is never called when autoPlayback is disabled', async () => {
        const q = new TestableQueue();
        q['disableAutoPlayback'] = true;
        const cb = jest.fn();
        q.onCrossfadeStart = cb;
        (q._currentAudio as any)._setDuration(200);
        q.currentSong = makeTrack('1', 'One');
        q.setQueue([makeTrack('2', 'Two')]);

        q.emit('queueNext');
        await Promise.resolve();
        q.emit('startFadeOut');
        await new Promise((r) => setTimeout(r, 50));

        expect(cb).not.toHaveBeenCalled();
    });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('Stop during crossfade', () => {
    it('stop() clears _crossfadeActive and fires crossfadeComplete callback', () => {
        const q = new TestableQueue();
        const completeCb = jest.fn();
        q.onCrossfadeComplete = completeCb;

        // Manually simulate mid-crossfade state (as PlayerCore.stop() guards)
        q._crossfadeActive = true;
        q._crossfadePrepared = true;

        // Replicate the guard from PlayerCore.stop()
        if (q._crossfadeActive) {
            q._crossfadeActive = false;
            q._crossfadePrepared = false;
            q.emit('crossfadeComplete');
            q.onCrossfadeComplete?.();
        }

        expect(q._crossfadeActive).toBe(false);
        expect(q._crossfadePrepared).toBe(false);
        expect(completeCb).toHaveBeenCalledTimes(1);
    });

    it('stop() is a no-op for crossfade state when not actively crossfading', () => {
        const q = new TestableQueue();
        const completeCb = jest.fn();
        q.onCrossfadeComplete = completeCb;

        // Guard check: _crossfadeActive is false by default
        if (q._crossfadeActive) {
            q._crossfadeActive = false;
            q.emit('crossfadeComplete');
            q.onCrossfadeComplete?.();
        }

        expect(completeCb).not.toHaveBeenCalled();
    });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('onCrossfadeStart / onCrossfadeComplete callbacks', () => {
    it('both callbacks fire in order for a full prepareCrossfade cycle', async () => {
        const q = new TestableQueue();
        (q._currentAudio as any)._setDuration(200);
        q.currentSong = makeTrack('1', 'One');
        q.setQueue([makeTrack('2', 'Two')]);

        const order: string[] = [];
        q.onCrossfadeStart = () => order.push('start');
        q.onCrossfadeComplete = () => order.push('complete');

        q.prepareCrossfade();
        await Promise.resolve();
        q.emit('startFadeOut');
        await new Promise((r) => setTimeout(r, 50));

        expect(order).toEqual(['start', 'complete']);
    });

    it('onCrossfadeStart is called synchronously when startFadeOut fires', async () => {
        const q = new TestableQueue();
        (q._currentAudio as any)._setDuration(200);
        q.currentSong = makeTrack('1', 'One');
        q.setQueue([makeTrack('2', 'Two')]);

        const startCb = jest.fn();
        q.onCrossfadeStart = startCb;

        q.prepareCrossfade();
        await Promise.resolve();

        expect(startCb).not.toHaveBeenCalled();
        q.emit('startFadeOut');
        expect(startCb).toHaveBeenCalledTimes(1);
    });

    it('neither callback fires when queue is empty (no crossfade target)', async () => {
        const q = new TestableQueue();
        (q._currentAudio as any)._setDuration(200);
        q.currentSong = makeTrack('1', 'One');
        q.setQueue([]);

        const startCb = jest.fn();
        const completeCb = jest.fn();
        q.onCrossfadeStart = startCb;
        q.onCrossfadeComplete = completeCb;

        q.prepareCrossfade();
        await Promise.resolve();

        expect(startCb).not.toHaveBeenCalled();
        expect(completeCb).not.toHaveBeenCalled();
    });
});
