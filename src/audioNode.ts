import Helpers from "./helpers";

import type { AudioOptions, EQBand, BasePlaylistItem } from "./types";
import HLS from "hls.js";
import { PlayerState } from "./state";

import {
  spectrumAnalyser,
  AudioMotionAnalyzer,
  type ConstructorOptions,
} from "./spectrumAnalyzer";

export default class AudioNode<S extends BasePlaylistItem> {
  _audioElement: HTMLAudioElement = <HTMLAudioElement>{};
  public hls: HLS | undefined;
  public state: PlayerState = PlayerState.STOPPED;
  public duration: number = 0;
  public currentTime: number = 0;
  public volume: number = 100;

  public isFading: boolean = false;
  public isFadingOut: boolean = false;
  public context: AudioContext | null = null;
  public motion: AudioMotionAnalyzer | null = null;

  private _accessToken?: string | (() => string);
  private tag: string;

  protected options: AudioOptions = <AudioOptions>{};
  protected parent: Helpers<S>;
  protected motionConfig: ConstructorOptions;
  protected motionColors: string[] = [
    "#ff0000",
    "#ffff00",
    "#00ff00",
    "#00ffff",
    "#0000ff",
    "#ff00ff",
    "#ff0000",
  ];
  protected fadeDuration: number = 3;
  protected prefetchLeeway: number = 10;
  protected crossFadeSteps = 20;
  protected fadeOutVolume = 0;
  protected fadeInVolume = 100;

  public hasNextQueued: boolean = false;
  public nextSongFired: boolean = false;
  protected repeat: "off" | "one" | "all" = "off";
  _disableAutoPlayback: boolean = false;
  private _lastSuppressedLog: number = 0;

  // Android TV
  protected isTv = window.matchMedia("(width: 960px) and (height: 540px)")
    .matches;

  protected bands: EQBand[] = [];
  _preGain: GainNode | null = null;
  _filters: BiquadFilterNode[] = [];
  _panner: StereoPannerNode | null = null;

  constructor(options: AudioOptions, parent: Helpers<S>) {
    this.options = options;
    this.parent = parent;
    this.tag = `AudioNode[${options.id}]`;
    this.prefetchLeeway = options.prefetchLeeway ?? 10;
    this.fadeDuration = options.fadeDuration ?? 3;
    this.bands = options.bands;
    this.motionConfig = options.motionConfig;
    this.motionColors = options.motionColors;

    this._initialize();
  }

  private log(message: string): void {
    this.parent._log(this.tag, message);
  }

  public dispose(): void {
    this._removeEvents();
    this._audioElement.remove();
  }

  private get accessToken(): string | undefined {
    return typeof this._accessToken === 'function' ? this._accessToken() : this._accessToken;
  }

  public setAccessToken(accessToken: string | (() => string)): void {
    this._accessToken = accessToken;
  }

  public setSource(url: string): AudioNode<S> {
    this.log(`setSource: autoplay=${this._audioElement.autoplay}, isFading=${this.isFading}, isFadingOut=${this.isFadingOut}`);
    this._audioElement.pause();
    this._audioElement.removeAttribute("src");

    if (!url.endsWith(".m3u8")) {
      this.hls?.destroy();
      this.hls = undefined;

      this._audioElement.src = `${url}${
        this.accessToken ? `?token=${this.accessToken}` : ""
      }`;
    } else if (HLS.isSupported()) {
      this.hls ??= new HLS({
        debug: false,
        enableWorker: true,
        lowLatencyMode: true,
        maxBufferHole: 0,
        maxBufferLength: 30,
        maxBufferSize: 0,
        autoStartLoad: true,
        testBandwidth: true,

        xhrSetup: (xhr) => {
          if (this.accessToken) {
            xhr.setRequestHeader("authorization", `Bearer ${this.accessToken}`);
          }
        },
      });

      this.hls?.loadSource(url);
      this.hls?.attachMedia(this._audioElement);
    } else if (
      this._audioElement.canPlayType("application/vnd.apple.mpegurl")
    ) {
      this._audioElement.src = `${url}${
        this.accessToken ? `?token=${this.accessToken}` : ""
      }`;
    }

    return this;
  }

  public play(): Promise<void> {
    return this._audioElement.play();
  }

  public pause(): void {
    this._audioElement.pause();
  }

  public stop(): void {
    this._audioElement.pause();
    this._audioElement.currentTime = 0;

    URL.revokeObjectURL(this._audioElement.src);
    this._audioElement.removeAttribute("src");
    this._audioElement.removeAttribute("data-src");
  }

  public setVolume(volume: number): void {
    const isMobileDevice = this.parent.isPlatform("android") || this.parent.isPlatform("ios");
    if (isMobileDevice) {
      this._audioElement.volume = 1;
      return;
    }

    if (volume < 0) volume = 0;
    if (volume > 100) volume = 100;
    this.volume = volume;
    this._audioElement.volume = volume / 100;
  }

  public fadeVolume(volume: number): void {
    if (volume < 0) volume = 0;
    if (volume > 100) volume = 100;
    this._audioElement.volume = volume / 100;
  }

  public getVolume(): number {
    return this.volume;
  }

  public mute() {
    this._audioElement.muted = true;
  }

  public unmute() {
    this._audioElement.muted = false;
  }

  public isPlaying(): boolean {
    return this.state === PlayerState.PLAYING;
  }

  public getDuration(): number {
    return this.duration;
  }

  public getCurrentTime(): number {
    return this.currentTime;
  }

  public getBuffer(): number {
    return this._audioElement.buffered.length;
  }

  public getPlaybackRate(): number {
    return this._audioElement.playbackRate;
  }

  public setCurrentTime(time: number): this {
    this._audioElement.currentTime = time;
    return this;
  }

  public getAudioElement(): HTMLAudioElement {
    return this._audioElement;
  }

  public getTimeData() {
    return {
      position: Math.abs(this.getCurrentTime()),
      duration: Math.abs(this.getDuration()),
      remaining:
        this.getDuration() < 0
          ? Infinity
          : Math.abs(this.getDuration()) - Math.abs(this.getCurrentTime()),
      buffered: this.getBuffer(),
      percentage:
        (Math.abs(this.getCurrentTime()) / Math.abs(this.getDuration())) * 100,
    };
  }

  public setCrossFadeSteps(steps: number) {
    this.crossFadeSteps = steps;
  }

  public setAutoPlayback(value: boolean): void {
    this._disableAutoPlayback = value;
  }

  public _fadeIn(firstRun: boolean = false) {
    if (firstRun) {
      this.log(`_fadeIn START, volume=${this.volume}, steps=${this.crossFadeSteps}`);
      this.fadeVolume(0);
      this.fadeInVolume = 0;
      this.nextSongFired = false;
    }

    this._audioElement.play().then();

    if (this.fadeInVolume < this.volume) {
      this.fadeInVolume += this.crossFadeSteps;

      setTimeout(() => this._fadeIn(), 200);
    } else {
      this.fadeInVolume = this.volume;
      this.isFading = false;
      this.log(`_fadeIn COMPLETE, isFading=false`);
    }

    if (this.fadeInVolume > 100) {
      this.fadeInVolume = 100;
    }

    this.fadeVolume(this.fadeInVolume);

    if (!this.nextSongFired && this.fadeInVolume >= this.volume - this.crossFadeSteps * 12) {
      this.nextSongFired = true;
      this.log(`emitting nextSong (fadeInVol=${this.fadeInVolume})`);
      this.parent.emit("nextSong");
    }
  }

  public _fadeOut(firstRun: boolean = false) {
    this.isFading = true;
    this.isFadingOut = true;
    if (firstRun) {
      this.log(`_fadeOut START, volume=${this.volume}, steps=${this.crossFadeSteps}`);
      this.fadeOutVolume = this.volume;
    }

    if (this.fadeOutVolume > 0) {
      this.fadeOutVolume -= this.crossFadeSteps;
      if (this.fadeOutVolume < 0) {
        this.fadeOutVolume = 0;
      }
      this.fadeVolume(this.fadeOutVolume);
      if (this.fadeOutVolume > 0) {
        setTimeout(() => this._fadeOut(), 200);
      }
    }

    if (this.fadeOutVolume <= 0) {
      this.fadeOutVolume = 0;
      this.fadeVolume(0);
      this.log(`_fadeOut COMPLETE, pausing + cleanup`);
      this.pause();

      URL.revokeObjectURL(this._audioElement?.src);
      this._audioElement?.removeAttribute("src");
      this._audioElement?.removeAttribute("data-src");

      this.parent.emit("endFadeOut");

      setTimeout(() => {
        this.hasNextQueued = false;
        this.isFading = false;
        this.isFadingOut = false;
        this.log(`emitting setCurrentAudio, restoring autoplay=true`);
        this._audioElement.autoplay = true;
        this.parent.emit("setCurrentAudio", this._audioElement);
      }, 500);
    }
  }

  setRepeating(repeat: "off" | "one" | "all") {
    this.repeat = repeat;
  }

  protected _initialize(): void {
    this._createAudioElement(this.options.id);

    this._addEvents();
  }

  protected _createAudioElement(id: number): this {
    this._audioElement = document.createElement("audio");
    this._audioElement.id = `audio-${id}`;
    this._audioElement.preload = "auto";
    this._audioElement.controls = false;
    this._audioElement.autoplay = true;
    this._audioElement.loop = false;
    this._audioElement.setAttribute("tabindex", "-1");

    let volume = this.options.volume ?? 100;
    if (volume < 0) volume = 0;
    if (volume > 100) volume = 100;

    this._audioElement.volume = volume / 100;
    // this._audioElement.style.display = 'none';
    this._audioElement.crossOrigin = "anonymous";

    document.body.appendChild(this._audioElement);

    return this;
  }

  private playEvent() {
    this.state = PlayerState.PLAYING;
    this.parent.emit("play-internal", this._audioElement);
    this._initializeContext();
    if (!this.isFading) {
      this.parent.emit("play", this._audioElement);
    } else {
      this.log(`playEvent SUPPRESSED (isFading=true)`);
    }
  }

  private pauseEvent() {
    this.state = PlayerState.PAUSED;
    this.parent.emit("pause-internal", this._audioElement);
    if (!this.isFading) {
      this.parent.emit("pause", this._audioElement);
    } else {
      this.log(`pauseEvent SUPPRESSED (isFading=true)`);
    }
  }

  private endedEvent() {
    this.log(`endedEvent, isFading=${this.isFading}`);
    this.state = PlayerState.ENDED;
    this.parent.emit("ended", this._audioElement);
  }

  private errorEvent() {
    console.error("Error", this._audioElement.error);
    this.state = PlayerState.ERROR;
    this.parent.emit("error", this._audioElement);
  }

  private waitingEvent() {
    this.state = PlayerState.BUFFERING;
    this.parent.emit("waiting", this._audioElement);
  }

  private canplayEvent() {
    this.parent.emit("canplay", this._audioElement);
    if (this.isPlaying()) return;
    this.state = PlayerState.IDLE;
  }

  private loadedmetadataEvent() {
    this.parent.emit("loadedmetadata", this._audioElement);
    if (this.isPlaying()) return;
    this.state = PlayerState.IDLE;
  }

  private loadstartEvent() {
    this.state = PlayerState.LOADING;
    this.parent.emit("loadstart", this._audioElement);
  }

  private timeupdateEvent() {
    this.state = PlayerState.PLAYING;
    this.currentTime = this._audioElement.currentTime;
    this.duration = this._audioElement.duration;

    this.parent.emit("time-internal", this.getTimeData());
    if (!this.isFading || this.repeat == "one") {
      this.parent.emit("time", this.getTimeData());
    } else {
      const now = Date.now();
      if (now - this._lastSuppressedLog > 2000) {
        this._lastSuppressedLog = now;
        this.log(`timeupdate SUPPRESSED: pos=${this._audioElement.currentTime.toFixed(1)}, dur=${this._audioElement.duration.toFixed(1)}, isFading=${this.isFading}`);
      }
    }

    if (
      !this.hasNextQueued &&
      this.repeat !== "one" &&
      this._audioElement.currentTime >=
      this._audioElement.duration - this.prefetchLeeway &&
      !this._disableAutoPlayback
    ) {
      this.hasNextQueued = true;
      this.log(`emitting queueNext (pos=${this._audioElement.currentTime.toFixed(1)}, dur=${this._audioElement.duration.toFixed(1)})`);
      this.parent.emit("queueNext");
    }

    if (
      this.repeat !== "one" &&
      this._audioElement.currentTime >=
      this._audioElement.duration - this.fadeDuration
    ) {
      this.parent.emit("startFadeOut");
    }
  }

  private durationchangeEvent() {
    this.duration = this._audioElement.duration;
    if (!this.isFading) {
      this.parent.emit("duration", this._audioElement.duration);
    }
  }

  private volumechangeEvent() {
    this.parent.emit("volume", this.volume);
  }

  private seekedEvent() {
    if (this.isFading) return;
    this.log(`seeked ${this._audioElement.currentTime.toFixed(2)}`);
    this.parent.emit("seeked", {
      buffered: this._audioElement.buffered.length,
      duration: this._audioElement.duration,
      percentage:
        (this._audioElement.currentTime / this._audioElement.duration) * 100,
      position: this._audioElement.currentTime,
      remaining: this._audioElement.duration - this._audioElement.currentTime,
    });
  }

  private _addEvents() {
    this._audioElement.addEventListener("play", this.playEvent.bind(this));
    this._audioElement.addEventListener("pause", this.pauseEvent.bind(this));
    this._audioElement.addEventListener("ended", this.endedEvent.bind(this));
    this._audioElement.addEventListener("error", this.errorEvent.bind(this));
    this._audioElement.addEventListener(
      "waiting",
      this.waitingEvent.bind(this)
    );
    this._audioElement.addEventListener(
      "canplay",
      this.canplayEvent.bind(this)
    );
    this._audioElement.addEventListener(
      "loadedmetadata",
      this.loadedmetadataEvent.bind(this)
    );
    this._audioElement.addEventListener(
      "loadstart",
      this.loadstartEvent.bind(this)
    );
    this._audioElement.addEventListener(
      "timeupdate",
      this.timeupdateEvent.bind(this)
    );
    this._audioElement.addEventListener(
      "durationchange",
      this.durationchangeEvent.bind(this)
    );
    this._audioElement.addEventListener(
      "volumechange",
      this.volumechangeEvent.bind(this)
    );
    this._audioElement.addEventListener("seeked", this.seekedEvent.bind(this));
  }

  private _removeEvents() {
    this._audioElement.removeEventListener("play", this.playEvent.bind(this));
    this._audioElement.removeEventListener("pause", this.pauseEvent.bind(this));
    this._audioElement.removeEventListener("ended", this.endedEvent.bind(this));
    this._audioElement.removeEventListener("error", this.errorEvent.bind(this));
    this._audioElement.removeEventListener(
      "waiting",
      this.waitingEvent.bind(this)
    );
    this._audioElement.removeEventListener(
      "canplay",
      this.canplayEvent.bind(this)
    );
    this._audioElement.removeEventListener(
      "loadedmetadata",
      this.loadedmetadataEvent.bind(this)
    );
    this._audioElement.removeEventListener(
      "loadstart",
      this.loadstartEvent.bind(this)
    );
    this._audioElement.removeEventListener(
      "timeupdate",
      this.timeupdateEvent.bind(this)
    );
    this._audioElement.removeEventListener(
      "durationchange",
      this.durationchangeEvent.bind(this)
    );
    this._audioElement.removeEventListener(
      "volumechange",
      this.volumechangeEvent.bind(this)
    );
    this._audioElement.removeEventListener(
      "seeked",
      this.seekedEvent.bind(this)
    );
  }

  private createFilter(frequency: number, type: BiquadFilterType) {
    const filter = this.context!.createBiquadFilter();
    filter.frequency.value = frequency;
    filter.type = type;
    filter.gain.value = 0;
    return filter;
  }

  private _initializeContext(): void {
    // Performance on Android TV is insufficient and causes the playback to stutter
    if (
      this.isTv ||
      localStorage.getItem("nmplayer-music-supports-audio-context") === "false"
    )
      return;

    if (!this.context) {
      try {
        this.motion = spectrumAnalyser(this._audioElement, this.motionConfig);

        if (this.motionColors.length) {
          this.motion.registerGradient("theme", {
            bgColor: "transparent",
            dir: "h",
            colorStops: this.motionColors,
          });

          this.motion.gradient = "theme";
        }

        setTimeout(() => {
          this.motion!.canvas.style.position = "absolute";
          this.motion!.canvas.style.height = "320px";
          this.motion!.canvas.style.width = "1400px";
          this.motion!.canvas.style.overflow = "hidden";
          this.motion!.canvas.style.opacity = "0";
          this.motion!.canvas.style.pointerEvents = "none";
        }, 500);

        this.context = this.motion.audioCtx;

        this.context.addEventListener("error", () => {
          localStorage.setItem(
            "nmplayer-music-supports-audio-context",
            "false"
          );
          this.context!.close().then();
          location.reload();
        });

        this._preGain = this.context.createGain();
        this._filters = this.bands
          .slice(1) // Skip the first band (it's the pre-gain)
          .map((band) =>
            this.createFilter(band.frequency as number, "peaking")
          );

        this._panner = this.context.createStereoPanner();

        const track1 = this.motion.connectedSources.at(0)!;
        track1.connect(this._preGain);

        this._filters
          .reduce((prev, curr) => {
            // noinspection CommaExpressionJS
            return prev.connect(curr), curr;
          }, this._preGain)
          .connect(this._panner)
          .connect(this.context.destination);

        this.parent.on("setPreGain", (gain: number) => {
          this._preGain!.gain.value = gain;
        });

        this.parent.on("setPanner", (pan: number) => {
          this._panner!.pan.value = pan;
        });

        this.parent.on("setFilter", (band: EQBand) => {
          const index = this.bands.findIndex(
            (b) => b.frequency === band.frequency
          );
          this._filters[index - 1].gain.value = band.gain;
        });

        this.parent.loadEqualizerSettings();
      } catch (e) {
        console.error("Failed to create AudioContext:", e);
        return;
      }
    }

    if (this.context && this.context.state === "suspended") {
      this.context
        .resume()
        .then(() => {
          this.log("AudioContext resumed");
        })
        .catch((e) => {
          console.error("Failed to resume AudioContext:", e);
        });
    }
  }
}
