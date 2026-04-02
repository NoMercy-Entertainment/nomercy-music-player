// noinspection JSUnusedGlobalSymbols

import Helpers from './helpers';

import type {IsShuffling, RepeatState, BasePlaylistItem} from './types';

export default class Queue<S extends BasePlaylistItem> extends Helpers<S> {
    public currentSong: S | null = null;

    protected _repeat: RepeatState = 'off';
    protected _queue: Array<S> = [];
    protected _backLog: Array<S> = [];
    protected _shuffle: IsShuffling = false;

    private readonly tag = 'Queue';

    constructor() {
        super();

        this._initializeQueue();
    }

    private log(message: string): void {
        this._log(this.tag, message);
    }

    public getQueue(): Array<S> {
        return this._queue
    }

    public setQueue(payload: Array<S>) {
        this._queue = [...payload].map((item) => Object.assign({}, item));
        this.emit('queue', this._queue)
    }

    public addToQueue(payload: S) {
        this._queue.push(Object.assign({}, payload));
        this.emit('queue', this._queue)
    }

    public pushToQueue(payload: S | S[]) {
        // Object.assign({}, array) produces a plain object — not an array.
        // Spread the items directly so the queue stays a flat S[].
        const items = Array.isArray(payload) ? payload : [payload];
        this._queue.push(...items);
        this.emit('queue', this._queue)
    }

    public removeFromQueue(payload: S) {
        // indexOf() uses reference equality.  Queue items are copies, so the
        // passed object will almost never be the same reference.  Match by id
        // instead.  Guard against not-found: indexOf returns -1, and
        // splice(-1, 1) would silently remove the last item.
        const index = this._queue.findIndex((item) => item.id === payload.id);
        if (index === -1) return;
        this._queue.splice(index, 1);
        this.emit('queue', this._queue)
    }

    public addToQueueNext(payload: S) {
        this._queue.unshift(Object.assign({}, payload));
        this.emit('queue', this._queue)
    }

    public getBackLog(): Array<S> {
        return this._backLog;
    }

    public setBackLog(payload: Array<S>) {
        this._backLog = [...payload].map((item) => Object.assign({}, item));
        this.emit('backlog', this._backLog)
    }

    public addToBackLog(payload: S | null) {
        if (!payload) return;
        this._backLog.push(Object.assign({}, payload));
        this.emit('backlog', this._backLog)
    }

    public pushToBackLog(payload: S | S[]) {
        // Same fix as pushToQueue — Object.assign({}, array) is not an array.
        const items = Array.isArray(payload) ? payload : [payload];
        this._backLog.push(...items);
        this.emit('backlog', this._backLog)
    }

    public removeFromBackLog(payload: S) {
        // Same fix as removeFromQueue — match by id, guard on not-found.
        const index = this._backLog.findIndex((item) => item.id === payload.id);
        if (index === -1) return;
        this._backLog.splice(index, 1);
        this.emit('backlog', this._backLog)
    }

    public setCurrentSong(payload: S | null) {
        this.log(`setCurrentSong: '${payload?.name ?? 'null'}'`);
        this.currentSong = payload;

        this.emit('song', payload);

        if (!payload) return;

        this.getNewSource(payload)
            .then((src) => {
                this._currentAudio.setSource(src);
                this._currentAudio.play()
                    .then(() => {
                        this._currentAudio
                            .getAudioElement()
                            .setAttribute('data-src', payload?.id?.toString());
                    });
            });
    }

    public next() {
        this.addToBackLog(this.currentSong);

        if (this._queue?.length > 0) {
            let nexItem = this._queue[0];

            if (this._shuffle) {
                const index = Math.round(
                    Math.random() * (this._queue.length - 1)
                );
                nexItem = this._queue[index];
            }

            this.setCurrentSong(nexItem);
            this.removeFromQueue(nexItem);
        } else {
            // Queue is empty and there are no more tracks to fetch from an external
            // source (that responsibility belongs to the consuming app via SignalR /
            // StartPlaybackCommand). The fallback here is to wrap the backlog back
            // into the queue and replay from the beginning — this matches the
            // behaviour expected when repeat=all is not set but the user has no
            // more tracks queued. If the server is driving playback it will issue
            // a new StartPlaybackCommand before this branch is ever reached.
            this.setCurrentSong(this._backLog[0]);
            this.setQueue(this._backLog.slice(1));

            this.setBackLog([]);
        }
    }

    public previous() {
        if (this._currentAudio.currentTime > 3) {
            this._currentAudio.setCurrentTime(0);
        } else if (this._backLog.length > 0) {
            const prevSong = this._backLog.at(-1);

            if (!prevSong) return;

            if (this.currentSong) {
                this.addToQueueNext(this.currentSong);
            }

            this.setCurrentSong(prevSong);

            this.removeFromBackLog(prevSong);
        } else {
            this._currentAudio.setCurrentTime(0);
        }
    }

    public playTrack(track: S, tracks?: S[]) {
        if (!this.currentSong?.id || this.currentSong?.id !== track?.id) {
            this.setCurrentSong(track);
        }

        if (tracks) {
            const index = tracks.findIndex((t) => t.id === track.id);

            if (index !== -1) {
                const afterIndex = tracks.slice(index + 1);
                const beforeIndex = tracks.slice(0, index);

                const uniqueQueue = [...afterIndex, ...beforeIndex];

                this.setQueue(uniqueQueue);
            }
        }
    }

    public shuffle(value: IsShuffling) {
        this._shuffle = value;
        this.isShuffling = value;
        this.emit('shuffle', value);
    }

    /**
     * Shared crossfade execution wired up after the next-track source is
     * loaded into _nextAudio.  Both prepareCrossfade() and the queueNext
     * handler previously duplicated this entire block — now there is one
     * canonical copy.
     *
     * @param target       - The track that will become currentSong.
     * @param currentVolume - Volume snapshot taken before source loading so
     *                        the fade step size is consistent.
     * @param callerTag    - Label used in log messages ("prepareCrossfade" /
     *                        "queueNext") to keep diagnostics readable.
     */
    private _executeCrossfade(target: S, currentVolume: number, callerTag: string): void {
        this.once('startFadeOut', () => {
            if (this._repeat === 'one') return;

            this.log(`${callerTag}: startFadeOut fired, beginning ${this.fadeDuration}s crossfade`);

            // Signal server to suppress auto-advance for the duration of this crossfade.
            this._crossfadeActive = true;
            this.emit('crossfadeStart');
            this.onCrossfadeStart?.();

            this._currentAudio.isFading = true;
            this._nextAudio.isFading = true;

            const steps = currentVolume / this.fadeDuration / 5;
            this._currentAudio.setCrossFadeSteps(steps);
            this._currentAudio._fadeOut(true);

            this._nextAudio.setCrossFadeSteps(steps);
            this._nextAudio._fadeIn(true);

            this.once('nextSong', () => {
                if (this._repeat === 'one') return;

                this.log(`${callerTag}: nextSong fired, switching to '${target?.name}', nextAudio.currentTime=${this._nextAudio.currentTime.toFixed(1)}`);

                this.addToBackLog(this.currentSong);

                this.currentSong = target;
                this.removeFromQueue(target);

                this._nextAudio.isFading = false;

                this.emit('song', target);

                this.once('setCurrentAudio', () => {
                    if (this._repeat == 'one') return;

                    this.log(`${callerTag}: setCurrentAudio, swapping nodes`);
                    this._currentAudio.isFading = false;

                    this._currentAudio = this._nextAudio;

                    this._nextAudio =
                        this._currentAudio == this._audioElement1
                            ? this._audioElement2
                            : this._audioElement1;

                    // Restore autoplay on new current node
                    this._currentAudio.getAudioElement().autoplay = true;
                    this._crossfadePrepared = false;

                    // Crossfade is complete — allow server to resume auto-advance.
                    this._crossfadeActive = false;
                    this.emit('crossfadeComplete');
                    this.onCrossfadeComplete?.();
                });
            });
        });
    }

    /**
     * Server-driven crossfade: load the next track into the secondary audio node
     * so crossfade can begin when startFadeOut fires.
     *
     * The consuming app should pass onCrossfadeStart / onCrossfadeComplete via
     * PlayerOptions to notify the server (e.g. via SignalR) to suppress its own
     * auto-advance timer while the client is driving the transition. If the client
     * disconnects mid-crossfade the server timer will fire as a safety fallback.
     */
    public prepareCrossfade(item?: S): void {
        if (this._repeat === 'one') return;
        if (this._crossfadePrepared) return;

        const target = item ?? this._queue[0];
        if (!target) return;

        // Short-track guard: if the track is shorter than the crossfade window,
        // skip the crossfade entirely so we don't clobber a track that barely started.
        const duration = this._currentAudio.getDuration();
        if (duration > 0 && duration <= this.fadeDuration) {
            this.log(`prepareCrossfade: SKIPPED — duration (${duration.toFixed(1)}s) <= fadeDuration (${this.fadeDuration}s)`);
            return;
        }

        this._crossfadePrepared = true;
        const currentVolume = this.volume;

        this.log(`prepareCrossfade: '${target?.name}', currentSong='${this.currentSong?.name}', volume=${currentVolume}`);

        this.getNewSource(target)
            .then((src) => {
                this._currentAudio.hasNextQueued = true;
                this._nextAudio.isFading = true;
                // Disable autoplay to prevent silent background playback during preparation
                this._nextAudio.getAudioElement().autoplay = false;
                this.log(`prepareCrossfade: source loaded, nextAudio.autoplay=false`);
                this._nextAudio.setSource(src);
                this._nextAudio.fadeVolume(0);

                this._executeCrossfade(target, currentVolume, 'prepareCrossfade');
            })
            .catch((err) => {
                this._crossfadePrepared = false;
                this._crossfadeActive = false;
                console.error('prepareCrossfade error:', err);
            });
    }

    public repeat(value: RepeatState) {
        this._repeat = value;
        this.emit('repeat', this._repeat);
        this.isRepeating = this._repeat !== 'off';

        this._currentAudio.setRepeating(this._repeat);
        this._nextAudio.setRepeating(this._repeat);
    }

    protected _initializeQueue(): void {

        // Fallback: if no prepareCrossfade was called (e.g., server didn't send the signal),
        // trigger a local crossfade when startFadeOut fires and the queue has tracks.
        this.on('startFadeOut', () => {
            if (!this._crossfadePrepared && this._queue.length > 0) {
                this.prepareCrossfade();
            }
        });

        this.on('ended', () => {
            if (this.disableAutoPlayback) return;
            if (this._repeat === 'one') {
                this._currentAudio.setCurrentTime(0);
                setTimeout(() => {
                    this._currentAudio.play().then();
                }, 150);
            }
        });

        this.on('queueNext', () => {
            if (this.disableAutoPlayback) return;
            if (this._repeat === 'one') return;

            if (this._repeat === 'all' && this._queue.length === 0) {
                this.setQueue(this._backLog);
                this.setBackLog([]);
            }

            if (this._queue.length == 0) return;

            // Short-track guard: if the current track is shorter than the crossfade
            // window, bail out now. The `ended` event will drive next-track selection
            // instead, avoiding a fade that starts before the track barely plays.
            const duration = this._currentAudio.getDuration();
            if (duration > 0 && duration <= this.fadeDuration) {
                this.log(`queueNext: SKIPPED — duration (${duration.toFixed(1)}s) <= fadeDuration (${this.fadeDuration}s)`);
                return;
            }

            const currentVolume = this.volume;
            const nextTrack = this._queue[0];

            this.log(`queueNext: pre-loading '${nextTrack?.name}', volume=${currentVolume}`);

            this.getNewSource(nextTrack)
                .then((src) => {
                    this._crossfadePrepared = true;
                    this._nextAudio.isFading = true;
                    // Disable autoplay to prevent silent background playback during preparation
                    this._nextAudio.getAudioElement().autoplay = false;
                    this.log(`queueNext: source loaded, nextAudio.autoplay=false`);
                    this._nextAudio.setSource(src);
                    this._nextAudio.fadeVolume(0);

                    this._executeCrossfade(nextTrack, currentVolume, 'queueNext');
                })
                .catch((err) => {
                    this._crossfadePrepared = false;
                    this._crossfadeActive = false;
                    console.error('queueNext error:', err);
                    this.currentSong = null;
                });
        });

        this.on('ended', (el) => {
            if (this.disableAutoPlayback) return;
            if (el == this._currentAudio.getAudioElement() && !this._currentAudio.isFading) {
                this.log(`ended: clearing currentSong (not fading)`);
                this.currentSong = null;
            } else {
                this.log(`ended: SKIPPED clear (isFading=${this._currentAudio.isFading}, isCurrentEl=${el == this._currentAudio.getAudioElement()})`);
            }
        });

        this.on('error', this.next.bind(this));
    }
}
