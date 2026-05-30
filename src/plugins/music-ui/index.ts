/**
 * Music UI plugin — plugin-driven transport controls for NMMusicPlayer.
 *
 * Mounts a self-contained overlay inside the kit-managed `.nomercymusicplayer`
 * container. State classes on the container (`.playing`, `.paused`, `.muted`,
 * `.buffering`) are applied by the kit automatically — the plugin reads them via
 * CSS selectors so no manual class toggling is needed for icon changes.
 *
 * File map (music-ui/ folder):
 *
 *   index.ts   — MusicUiPlugin class: lifecycle, DOM, event wiring, seek scrub.
 *   styles.ts  — CSS injection (ensureMusicUiStyles).
 *   icons.ts   — Fluent icon SVG path table + svgFromMusicIcon().
 *
 * DOM tree:
 *
 *   .nmmusic-ui
 *     ├─ .nmmusic-art                         (album art)
 *     ├─ .nmmusic-track-info                  (title / artist / album)
 *     ├─ .nmmusic-progress-row                (time + seek bar)
 *     │   ├─ .nmmusic-time.nmmusic-current-time
 *     │   ├─ .nmmusic-seek-bar (role=slider)
 *     │   │   ├─ .nmmusic-seek-buffer
 *     │   │   ├─ .nmmusic-seek-fill
 *     │   │   └─ .nmmusic-seek-thumb
 *     │   └─ .nmmusic-time.nmmusic-duration-time
 *     └─ .nmmusic-controls-row
 *         ├─ .nmmusic-btn[data-action=shuffle]  (priority 3)
 *         ├─ .nmmusic-btn[data-action=previous] (priority 2)
 *         ├─ .nmmusic-btn.nmmusic-play-btn
 *         ├─ .nmmusic-btn[data-action=next]     (priority 2)
 *         ├─ .nmmusic-btn[data-action=repeat]   (priority 3)
 *         └─ .nmmusic-volume-group
 *             ├─ .nmmusic-btn[data-action=mute]
 *             ├─ input.nmmusic-vol-slider
 *             └─ .nmmusic-vol-slider-vertical (popup)
 *                 ├─ input.nmmusic-vol-slider-vertical-input
 *                 └─ button.nmmusic-vol-popup-mute
 *
 * Responsive priority: play > prev/next > shuffle/repeat > volume. Lower-
 * priority controls collapse at narrow widths via CSS container queries.
 */

import type { NMMusicPlayer } from '../../index';

import type { MusicPlaylistItem } from '../../types';
import type { MusicIconKey } from './icons';
import { Plugin } from '@nomercy-entertainment/nomercy-player-core';

import { RepeatState, ShuffleState } from '../../types';
import { svgFromMusicIcon } from './icons';
import { ensureMusicUiStyles } from './styles';

// ── Option interfaces ──────────────────────────────────────────────────────────

/** Per-section visibility toggles for the music UI overlay. */
export interface MusicUiOptions {
	/** Show the album art section. Default `true`. */
	showAlbumArt?: boolean;
	/** Show the track title / artist / album block. Default `true`. */
	showTrackInfo?: boolean;
	/** Show the progress / seek bar row. Default `true`. */
	showProgress?: boolean;
	/** Show the volume button + slider. Default `true`. */
	showVolume?: boolean;
	/** Show the shuffle button. Default `true`. */
	showShuffle?: boolean;
	/** Show the repeat button. Default `true`. */
	showRepeat?: boolean;
	/**
	 * Show the playback-speed button. Default `false` — most music listeners
	 *  don't want speed control but the option must exist for parity.
	 */
	showSpeed?: boolean;
	/**
	 * Volume slider orientation.
	 * - `'horizontal'` — always-visible inline slider (legacy default).
	 * - `'vertical'`   — popup slider above the mute button, toggle on click.
	 * - `'auto'`       — vertical when width ≤ 520 px OR on a touch-only device.
	 *   Default: `'auto'`.
	 */
	volumeSlider?: 'horizontal' | 'vertical' | 'auto';
}

/** Events emitted by {@link MusicUiPlugin} under the `plugin:music-ui:` namespace. */
export interface MusicUiEvents {
	seek: { time: number };
}

// ── DOM refs ───────────────────────────────────────────────────────────────────

interface ArtRefs {
	artWrap: HTMLDivElement;
	artImg: HTMLImageElement;
	artPlaceholder: HTMLDivElement;
}

interface TrackInfoRefs {
	infoWrap: HTMLDivElement;
	titleEl: HTMLParagraphElement;
	artistEl: HTMLParagraphElement;
	albumEl: HTMLParagraphElement;
}

interface ProgressRefs {
	progressRow: HTMLDivElement;
	currentTimeEl: HTMLSpanElement;
	seekBar: HTMLDivElement;
	seekBuffer: HTMLDivElement;
	seekFill: HTMLDivElement;
	seekThumb: HTMLDivElement;
	durationTimeEl: HTMLSpanElement;
}

interface ControlsRefs {
	controlsRow: HTMLDivElement;
	shuffleBtn: HTMLButtonElement;
	prevBtn: HTMLButtonElement;
	playBtn: HTMLButtonElement;
	nextBtn: HTMLButtonElement;
	repeatBtn: HTMLButtonElement;
	volumeGroup: HTMLDivElement;
	muteBtn: HTMLButtonElement;
	volSlider: HTMLInputElement;
	volSliderVertical: HTMLDivElement;
	volSliderVerticalInput: HTMLInputElement;
	volPopupMuteBtn: HTMLButtonElement;
	speedBtn: HTMLButtonElement;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(seconds: number): string {
	if (!Number.isFinite(seconds) || seconds < 0)
		return '0:00';
	const minutes = Math.floor(seconds / 60);
	const secs = Math.floor(seconds % 60);
	return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

function isMusicItem(value: unknown): value is MusicPlaylistItem {
	return value !== null && typeof value === 'object' && 'name' in value;
}

const PLACEHOLDER_SVG = `<svg viewBox="0 0 24 24" fill="currentColor" width="48" height="48" aria-hidden="true"><path d="M12 3a9 9 0 100 18A9 9 0 0012 3zm0 16a7 7 0 110-14 7 7 0 010 14zm0-10a3 3 0 100 6 3 3 0 000-6z"/></svg>`;

const SPEED_STEPS: ReadonlyArray<number> = [0.5, 0.75, 1, 1.25, 1.5, 2];

// ── Plugin class ───────────────────────────────────────────────────────────────

export class MusicUiPlugin extends Plugin<NMMusicPlayer, MusicUiOptions, MusicUiEvents> {
	static override readonly id: string = 'music-ui';
	static override readonly version: string = '2.0.0';
	static override readonly description: string = 'Official music UI overlay — album art, track info, seek bar, transport controls';

	static override readonly translations = {
		en: {
			'plugin.music-ui.tooltip.play': 'Play',
			'plugin.music-ui.tooltip.pause': 'Pause',
			'plugin.music-ui.tooltip.previous': 'Previous',
			'plugin.music-ui.tooltip.next': 'Next',
			'plugin.music-ui.tooltip.shuffle': 'Shuffle',
			'plugin.music-ui.tooltip.repeat': 'Repeat',
			'plugin.music-ui.tooltip.repeatOne': 'Repeat one',
			'plugin.music-ui.tooltip.mute': 'Mute',
			'plugin.music-ui.tooltip.unmute': 'Unmute',
			'plugin.music-ui.tooltip.speed': 'Playback speed',
		},
	};

	// ── DOM refs ──────────────────────────────────────────────────────
	private overlay!: HTMLDivElement;
	private artRefs!: ArtRefs;
	private infoRefs!: TrackInfoRefs;
	private progressRefs!: ProgressRefs;
	private controlsRefs!: ControlsRefs;

	// ── Scrub state ───────────────────────────────────────────────────
	private isScrubbing = false;
	private cachedDuration = 0;

	// ── Volume slider state ───────────────────────────────────────────
	private _volSliderVerticalOpen = false;
	private _isNoHover = false;
	private _volResizeObserver: ResizeObserver | null = null;

	// ── Playback state ────────────────────────────────────────────────
	private currentRepeat: RepeatState = RepeatState.OFF;
	private isShuffle = false;
	private currentRate = 1;

	override use(): void {
		ensureMusicUiStyles();
		this.buildDom();
		this.wireEvents();
		this.wireNoHover();
		this.wireVolumeSlider();
		this.applyOptions(this.opts ?? {});
		this.syncInitialState();
	}

	override dispose(): void {
		this._volResizeObserver?.disconnect();
		this._volResizeObserver = null;
		super.dispose();
	}

	// ── DOM construction ───────────────────────────────────────────────────────

	private buildDom(): void {
		this.overlay = this.mount('nmmusic-ui-overlay');
		this.overlay.className = 'nmmusic-ui';

		this.artRefs = this.buildArt();
		this.infoRefs = this.buildTrackInfo();
		this.progressRefs = this.buildProgressRow();
		this.controlsRefs = this.buildControlsRow();
	}

	private buildArt(): ArtRefs {
		const artWrap = document.createElement('div');
		artWrap.className = 'nmmusic-art';

		const artImg = document.createElement('img');
		artImg.className = 'nmmusic-art-img';
		artImg.alt = '';
		artImg.hidden = true;

		const artPlaceholder = document.createElement('div');
		artPlaceholder.className = 'nmmusic-art-placeholder';
		artPlaceholder.innerHTML = PLACEHOLDER_SVG;

		artWrap.appendChild(artImg);
		artWrap.appendChild(artPlaceholder);
		this.overlay.appendChild(artWrap);

		return {
			artWrap,
			artImg,
			artPlaceholder,
		};
	}

	private buildTrackInfo(): TrackInfoRefs {
		const infoWrap = document.createElement('div');
		infoWrap.className = 'nmmusic-track-info';

		const titleEl = document.createElement('p');
		titleEl.className = 'nmmusic-track-title';
		titleEl.textContent = '—';

		const artistEl = document.createElement('p');
		artistEl.className = 'nmmusic-track-artist';

		const albumEl = document.createElement('p');
		albumEl.className = 'nmmusic-track-album';

		infoWrap.appendChild(titleEl);
		infoWrap.appendChild(artistEl);
		infoWrap.appendChild(albumEl);
		this.overlay.appendChild(infoWrap);

		return {
			infoWrap,
			titleEl,
			artistEl,
			albumEl,
		};
	}

	private buildProgressRow(): ProgressRefs {
		const progressRow = document.createElement('div');
		progressRow.className = 'nmmusic-progress-row';

		const currentTimeEl = document.createElement('span');
		currentTimeEl.className = 'nmmusic-time nmmusic-current-time';
		currentTimeEl.textContent = '0:00';

		const seekBar = document.createElement('div');
		seekBar.className = 'nmmusic-seek-bar';
		seekBar.setAttribute('role', 'slider');
		seekBar.setAttribute('aria-label', 'Seek');
		seekBar.setAttribute('aria-valuemin', '0');
		seekBar.setAttribute('aria-valuemax', '100');
		seekBar.setAttribute('aria-valuenow', '0');
		seekBar.tabIndex = 0;

		const seekBuffer = document.createElement('div');
		seekBuffer.className = 'nmmusic-seek-buffer';

		const seekFill = document.createElement('div');
		seekFill.className = 'nmmusic-seek-fill';

		const seekThumb = document.createElement('div');
		seekThumb.className = 'nmmusic-seek-thumb';

		seekBar.appendChild(seekBuffer);
		seekBar.appendChild(seekFill);
		seekBar.appendChild(seekThumb);

		const durationTimeEl = document.createElement('span');
		durationTimeEl.className = 'nmmusic-time nmmusic-duration-time';
		durationTimeEl.textContent = '0:00';

		progressRow.appendChild(currentTimeEl);
		progressRow.appendChild(seekBar);
		progressRow.appendChild(durationTimeEl);
		this.overlay.appendChild(progressRow);

		this.wireSeekBar(seekBar, seekFill, seekThumb);

		return {
			progressRow,
			currentTimeEl,
			seekBar,
			seekBuffer,
			seekFill,
			seekThumb,
			durationTimeEl,
		};
	}

	private buildControlsRow(): ControlsRefs {
		const controlsRow = document.createElement('div');
		controlsRow.className = 'nmmusic-controls-row';

		const shuffleBtn = this.makeBtn('shuffle', 'shuffle', 3);
		const prevBtn = this.makeBtn('previous', 'prev', 2);
		const playBtn = this.makeBtn('play', 'play', 0);
		playBtn.classList.add('nmmusic-play-btn');
		const nextBtn = this.makeBtn('next', 'next', 2);
		const repeatBtn = this.makeBtn('repeat', 'repeat', 3);
		const speedBtn = this.makeSpeedBtn();

		const volumeGroup = document.createElement('div');
		volumeGroup.className = 'nmmusic-volume-group';

		const muteBtn = this.makeBtn('mute', 'volHigh', 0);

		const volSlider = document.createElement('input');
		volSlider.type = 'range';
		volSlider.className = 'nmmusic-vol-slider';
		volSlider.min = '0';
		volSlider.max = '100';
		volSlider.step = '1';
		volSlider.value = '100';
		volSlider.setAttribute('aria-label', 'Volume');

		const volSliderVertical = document.createElement('div');
		volSliderVertical.className = 'nmmusic-vol-slider-vertical';

		const volSliderVerticalInput = document.createElement('input');
		volSliderVerticalInput.type = 'range';
		volSliderVerticalInput.className = 'nmmusic-vol-slider-vertical-input';
		volSliderVerticalInput.min = '0';
		volSliderVerticalInput.max = '100';
		volSliderVerticalInput.step = '1';
		volSliderVerticalInput.value = '100';
		volSliderVerticalInput.setAttribute('aria-label', 'Volume');
		volSliderVerticalInput.setAttribute('orient', 'vertical');

		const volPopupMuteBtn = document.createElement('button');
		volPopupMuteBtn.className = 'nmmusic-btn nmmusic-vol-popup-mute';
		volPopupMuteBtn.setAttribute('aria-label', this.t('tooltip.mute'));
		volPopupMuteBtn.innerHTML = svgFromMusicIcon('volHigh', 20);

		volSliderVertical.appendChild(volSliderVerticalInput);
		volSliderVertical.appendChild(volPopupMuteBtn);
		volumeGroup.appendChild(muteBtn);
		volumeGroup.appendChild(volSlider);
		volumeGroup.appendChild(volSliderVertical);

		controlsRow.appendChild(shuffleBtn);
		controlsRow.appendChild(prevBtn);
		controlsRow.appendChild(playBtn);
		controlsRow.appendChild(nextBtn);
		controlsRow.appendChild(repeatBtn);
		controlsRow.appendChild(speedBtn);
		controlsRow.appendChild(volumeGroup);
		this.overlay.appendChild(controlsRow);

		this.wireControls(shuffleBtn, prevBtn, playBtn, nextBtn, repeatBtn, speedBtn, muteBtn, volSlider, volSliderVerticalInput, volPopupMuteBtn);

		return {
			controlsRow,
			shuffleBtn,
			prevBtn,
			playBtn,
			nextBtn,
			repeatBtn,
			volumeGroup,
			muteBtn,
			volSlider,
			volSliderVertical,
			volSliderVerticalInput,
			volPopupMuteBtn,
			speedBtn,
		};
	}

	private makeBtn(action: string, iconKey: MusicIconKey, priority: number): HTMLButtonElement {
		const btn = document.createElement('button');
		btn.className = 'nmmusic-btn';
		btn.dataset['action'] = action;
		if (priority > 0)
			btn.dataset['priority'] = String(priority);
		btn.innerHTML = svgFromMusicIcon(iconKey);
		btn.title = this.t(`tooltip.${action}`);
		return btn;
	}

	private makeSpeedBtn(): HTMLButtonElement {
		const btn = document.createElement('button');
		btn.className = 'nmmusic-btn nmmusic-speed-btn';
		btn.dataset['action'] = 'speed';
		btn.title = this.t('tooltip.speed');
		btn.textContent = '1×';
		btn.hidden = true;
		return btn;
	}

	// ── Seek-bar wiring ────────────────────────────────────────────────────────

	private wireSeekBar(
		seekBar: HTMLDivElement,
		seekFill: HTMLDivElement,
		seekThumb: HTMLDivElement,
	): void {
		seekBar.style.touchAction = 'none';

		const seekToRatio = (ratio: number): void => {
			const clamped = Math.min(1, Math.max(0, ratio));
			const time = clamped * this.cachedDuration;
			void this.player.currentTime(time);
			this.updateSeekPosition(clamped, seekFill, seekThumb, this.progressRefs.seekBar);
			this.emit('seek', { time });
		};

		const ratioFromClientX = (clientX: number): number => {
			const rect = seekBar.getBoundingClientRect();
			return rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
		};

		// Mouse scrub.
		this.listen(seekBar, 'mousedown', (event: Event) => {
			this.isScrubbing = true;
			seekToRatio(ratioFromClientX((event as MouseEvent).clientX));
		});

		this.listen(document, 'mousemove', (event: Event) => {
			if (!this.isScrubbing)
				return;
			seekToRatio(ratioFromClientX((event as MouseEvent).clientX));
		});

		this.listen(document, 'mouseup', () => {
			this.isScrubbing = false;
		});

		// Touch scrub — prevents browser scroll-interception while dragging.
		this.listen(seekBar, 'touchstart', (event: Event) => {
			const touch = (event as TouchEvent).touches[0];
			if (!touch)
				return;
			this.isScrubbing = true;
			seekToRatio(ratioFromClientX(touch.clientX));
		});

		this.listen(document, 'touchmove', (event: Event) => {
			if (!this.isScrubbing)
				return;
			const touch = (event as TouchEvent).touches[0];
			if (!touch)
				return;
			seekToRatio(ratioFromClientX(touch.clientX));
		});

		this.listen(document, 'touchend', () => {
			this.isScrubbing = false;
		});

		this.listen(seekBar, 'keydown', (event: Event) => {
			const key = (event as KeyboardEvent).key;
			const step = this.cachedDuration > 0 ? 5 / this.cachedDuration : 0;
			if (key === 'ArrowRight') { seekToRatio(this.currentSeekRatio() + step); event.preventDefault(); }
			if (key === 'ArrowLeft') { seekToRatio(this.currentSeekRatio() - step); event.preventDefault(); }
		});
	}

	private currentSeekRatio(): number {
		if (this.cachedDuration <= 0)
			return 0;
		return this.player.currentTime() / this.cachedDuration;
	}

	private updateSeekPosition(
		ratio: number,
		seekFill: HTMLDivElement,
		seekThumb: HTMLDivElement,
		seekBar: HTMLDivElement,
	): void {
		const pct = `${ratio * 100}%`;
		seekFill.style.width = pct;
		seekThumb.style.left = pct;
		seekBar.setAttribute('aria-valuenow', String(Math.round(ratio * 100)));
	}

	// ── Controls wiring ────────────────────────────────────────────────────────

	private wireControls(
		shuffleBtn: HTMLButtonElement,
		prevBtn: HTMLButtonElement,
		playBtn: HTMLButtonElement,
		nextBtn: HTMLButtonElement,
		repeatBtn: HTMLButtonElement,
		speedBtn: HTMLButtonElement,
		muteBtn: HTMLButtonElement,
		volSlider: HTMLInputElement,
		volSliderVerticalInput: HTMLInputElement,
		volPopupMuteBtn: HTMLButtonElement,
	): void {
		this.listen(shuffleBtn, 'click', () => {
			void this.player.shuffleState(!this.isShuffle);
		});

		this.listen(prevBtn, 'click', () => {
			void this.player.previous();
		});

		this.listen(playBtn, 'click', () => {
			void this.player.togglePlayback();
		});

		this.listen(nextBtn, 'click', () => {
			void this.player.next();
		});

		this.listen(repeatBtn, 'click', () => {
			const order: ReadonlyArray<RepeatState> = [RepeatState.OFF, RepeatState.ONE, RepeatState.ALL];
			const nextRepeat = order[(order.indexOf(this.currentRepeat) + 1) % order.length] ?? RepeatState.OFF;
			this.player.repeatState(nextRepeat);
		});

		this.listen(speedBtn, 'click', () => {
			const currentIdx = SPEED_STEPS.indexOf(this.currentRate);
			const nextRate = SPEED_STEPS[(currentIdx + 1) % SPEED_STEPS.length] ?? 1;
			this.player.playbackRate(nextRate);
		});

		this.listen(muteBtn, 'click', () => {
			// In vertical-slider mode the click opens/closes the popup.
			// Bail before toggling mute so a single tap on mobile doesn't both
			// mute AND toggle the popup (leaving mute flipped with slider closed).
			const volumeGroup = muteBtn.closest('.nmmusic-volume-group');
			if (volumeGroup?.classList.contains('nmmusic-volume-group-vertical')) {
				this.toggleVerticalVolSlider();
				return;
			}
			this.player.toggleMute();
		});

		this.listen(volSlider, 'input', (event: Event) => {
			const inputEl = event.target as HTMLInputElement;
			this.player.volume(Number(inputEl.value));
		});

		this.listen(volSliderVerticalInput, 'input', (event: Event) => {
			const inputEl = event.target as HTMLInputElement;
			this.player.volume(Number(inputEl.value));
		});

		this.listen(volPopupMuteBtn, 'click', (event: Event) => {
			event.stopPropagation();
			this.player.toggleMute();
		});
	}

	// ── Touch / no-hover detection ─────────────────────────────────────────────

	private wireNoHover(): void {
		if (typeof window === 'undefined' || typeof window.matchMedia !== 'function')
			return;

		const mql = window.matchMedia('(hover: none) and (pointer: coarse)');
		this._isNoHover = mql.matches;

		this.listen(mql as unknown as EventTarget, 'change', () => {
			this._isNoHover = (mql as MediaQueryList).matches;
			this.applyVolumeMode();
		});
	}

	private wireVolumeSlider(): void {
		const container = this.player.container;
		if (!container)
			return;

		this.applyVolumeMode();

		const AUTO_VERTICAL_THRESHOLD = 520;

		const evaluate = (width: number): boolean =>
			this._isNoHover || width <= AUTO_VERTICAL_THRESHOLD;

		this._volResizeObserver = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (!entry)
				return;
			const useVertical = evaluate(entry.contentRect.width);
			this.applyVerticalMode(useVertical);
			if (!useVertical && this._volSliderVerticalOpen) {
				this.closeVerticalVolSlider();
			}
		});

		this._volResizeObserver.observe(container);
	}

	private applyVolumeMode(): void {
		const mode = this.opts?.volumeSlider ?? 'auto';
		const container = this.player.container;

		if (mode === 'horizontal') {
			this.applyVerticalMode(false);
			return;
		}

		if (mode === 'vertical') {
			this.applyVerticalMode(true);
			return;
		}

		// 'auto'
		const width = container?.clientWidth ?? 0;
		const AUTO_VERTICAL_THRESHOLD = 520;
		this.applyVerticalMode(this._isNoHover || width <= AUTO_VERTICAL_THRESHOLD);
	}

	private applyVerticalMode(vertical: boolean): void {
		const { volumeGroup, volSlider, volSliderVertical } = this.controlsRefs;
		volumeGroup.classList.toggle('nmmusic-volume-group-vertical', vertical);
		volSlider.hidden = vertical;
		volSliderVertical.classList.toggle('nmmusic-vol-slider-vertical-open', vertical && this._volSliderVerticalOpen);
	}

	private toggleVerticalVolSlider(): void {
		if (this._volSliderVerticalOpen) {
			this.closeVerticalVolSlider();
		}
		else {
			this.openVerticalVolSlider();
		}
	}

	private openVerticalVolSlider(): void {
		const { volSliderVertical, volSliderVerticalInput } = this.controlsRefs;
		const currentLevel = this.player.volume();
		volSliderVerticalInput.value = String(Math.round(currentLevel));
		volSliderVertical.classList.add('nmmusic-vol-slider-vertical-open');
		this._volSliderVerticalOpen = true;
	}

	private closeVerticalVolSlider(): void {
		this.controlsRefs.volSliderVertical.classList.remove('nmmusic-vol-slider-vertical-open');
		this._volSliderVerticalOpen = false;
	}

	// ── Player event wiring ────────────────────────────────────────────────────

	private wireEvents(): void {
		this.on('play', () => {
			this.controlsRefs.playBtn.innerHTML = svgFromMusicIcon('pause', 22);
			this.controlsRefs.playBtn.title = this.t('tooltip.pause');
		});

		this.on('pause', () => {
			this.controlsRefs.playBtn.innerHTML = svgFromMusicIcon('play', 22);
			this.controlsRefs.playBtn.title = this.t('tooltip.play');
		});

		this.on('ended', () => {
			this.controlsRefs.playBtn.innerHTML = svgFromMusicIcon('play', 22);
			this.controlsRefs.playBtn.title = this.t('tooltip.play');
		});

		this.on('time', (data) => {
			if (this.isScrubbing)
				return;
			const time = data.time;
			const ratio = this.cachedDuration > 0 ? time / this.cachedDuration : 0;
			this.progressRefs.currentTimeEl.textContent = fmt(time);
			this.updateSeekPosition(ratio, this.progressRefs.seekFill, this.progressRefs.seekThumb, this.progressRefs.seekBar);
			this.updateBufferFill();
		});

		this.on('duration', (data) => {
			this.cachedDuration = data.duration;
			this.progressRefs.durationTimeEl.textContent = fmt(this.cachedDuration);
		});

		this.on('volume', (data) => {
			const level = Math.round(Math.max(0, Math.min(100, data.level)));
			this.controlsRefs.volSlider.value = String(level);
			this.controlsRefs.volSlider.style.setProperty('--vol-pct', `${level}%`);
			this.controlsRefs.volSliderVerticalInput.value = String(level);
		});

		this.on('mute', (data) => {
			const muted = data.muted;
			this.controlsRefs.muteBtn.innerHTML = svgFromMusicIcon(muted ? 'volMuted' : 'volHigh');
			this.controlsRefs.muteBtn.title = this.t(muted ? 'tooltip.unmute' : 'tooltip.mute');

			this.controlsRefs.volPopupMuteBtn.innerHTML = svgFromMusicIcon(muted ? 'volMuted' : 'volHigh', 20);
			this.controlsRefs.volPopupMuteBtn.setAttribute(
				'aria-label',
				this.t(muted ? 'tooltip.unmute' : 'tooltip.mute'),
			);

			const currentVol = Math.round(this.player.volume());
			this.controlsRefs.volSlider.value = muted ? '0' : String(currentVol);
			this.controlsRefs.volSliderVerticalInput.value = muted ? '0' : String(currentVol);
		});

		this.on('repeat', (data) => {
			this.currentRepeat = data.state;
			this.applyRepeatIcon();
		});

		this.on('shuffle', (data) => {
			this.isShuffle = data.state === ShuffleState.ON;
			this.controlsRefs.shuffleBtn.classList.toggle('active', this.isShuffle);
		});

		this.on('current', (data) => {
			const item = isMusicItem(data.item) ? data.item : null;
			this.applyCurrentTrack(item);

			// If duration is already known for the new track (e.g. the
			// backend cached metadata or `duration` fired before this
			// `current` listener), preserve it instead of stalling the
			// display at 0:00 until the user scrubs. next() races
			// duration→current in some backends — the display was stuck
			// at 0:00 across track changes when current arrived second.
			const dur = this.player.duration();
			this.cachedDuration = dur > 0 ? dur : 0;
			this.progressRefs.durationTimeEl.textContent = dur > 0 ? fmt(dur) : '0:00';
			this.progressRefs.currentTimeEl.textContent = '0:00';
			this.updateSeekPosition(0, this.progressRefs.seekFill, this.progressRefs.seekThumb, this.progressRefs.seekBar);
		});

		this.on('crossfadeStart', () => {
			this.artRefs.artWrap.classList.add('transitioning');
		});

		this.on('crossfadeComplete', () => {
			this.artRefs.artWrap.classList.remove('transitioning');
		});
	}

	// ── State appliers ─────────────────────────────────────────────────────────

	private applyCurrentTrack(item: MusicPlaylistItem | null): void {
		this.infoRefs.titleEl.textContent = item?.name ?? '—';

		const artists = item?.artistTracks?.map(artist => artist.name).join(', ') ?? '';
		this.infoRefs.artistEl.textContent = artists;
		this.infoRefs.artistEl.hidden = artists.length === 0;

		const albums = item?.albumTracks?.map(album => album.name).join(', ') ?? '';
		this.infoRefs.albumEl.textContent = albums;
		this.infoRefs.albumEl.hidden = albums.length === 0;

		if (item?.cover) {
			this.artRefs.artImg.src = item.cover;
			this.artRefs.artImg.alt = item.name;
			this.artRefs.artImg.hidden = false;
			this.artRefs.artPlaceholder.hidden = true;
		}
		else {
			this.artRefs.artImg.src = '';
			this.artRefs.artImg.hidden = true;
			this.artRefs.artPlaceholder.hidden = false;
		}
	}

	private applyRepeatIcon(): void {
		const { repeatBtn } = this.controlsRefs;
		const isActive = this.currentRepeat !== RepeatState.OFF;
		repeatBtn.classList.toggle('active', isActive);
		if (this.currentRepeat === RepeatState.ONE) {
			repeatBtn.innerHTML = svgFromMusicIcon('repeatOne');
			repeatBtn.title = this.t('tooltip.repeatOne');
		}
		else {
			repeatBtn.innerHTML = svgFromMusicIcon('repeat');
			repeatBtn.title = this.t('tooltip.repeat');
		}
	}

	private updateBufferFill(): void {
		if (this.cachedDuration <= 0)
			return;
		const buffered = this.player.buffered();
		const ratio = buffered / this.cachedDuration;
		this.progressRefs.seekBuffer.style.width = `${ratio * 100}%`;
	}

	// ── Initial state sync ─────────────────────────────────────────────────────

	private syncInitialState(): void {
		const current = this.player.current();
		if (isMusicItem(current)) {
			this.applyCurrentTrack(current);
		}

		const duration = this.player.duration();
		if (duration > 0) {
			this.cachedDuration = duration;
			this.progressRefs.durationTimeEl.textContent = fmt(duration);
		}

		const currentTime = this.player.currentTime();
		if (currentTime > 0) {
			const ratio = this.cachedDuration > 0 ? currentTime / this.cachedDuration : 0;
			this.progressRefs.currentTimeEl.textContent = fmt(currentTime);
			this.updateSeekPosition(ratio, this.progressRefs.seekFill, this.progressRefs.seekThumb, this.progressRefs.seekBar);
		}

		const vol = Math.round(this.player.volume());
		this.controlsRefs.volSlider.value = String(vol);
		this.controlsRefs.volSlider.style.setProperty('--vol-pct', `${vol}%`);
		this.controlsRefs.volSliderVerticalInput.value = String(vol);

		this.currentRepeat = this.player.repeatState();
		this.applyRepeatIcon();

		const shuffleVal = this.player.shuffleState();
		this.isShuffle = shuffleVal === ShuffleState.ON;
		this.controlsRefs.shuffleBtn.classList.toggle('active', this.isShuffle);
	}

	// ── Options live-update ────────────────────────────────────────────────────

	override options(): Readonly<MusicUiOptions>;
	override options(partial: Partial<MusicUiOptions>): void;
	override options(partial?: Partial<MusicUiOptions>): Readonly<MusicUiOptions> | void {
		if (partial === undefined) {
			return super.options();
		}
		super.options(partial);
		this.applyOptions(this.opts ?? {});
	}

	private applyOptions(opts: MusicUiOptions): void {
		this.artRefs.artWrap.hidden = opts.showAlbumArt === false;
		this.infoRefs.infoWrap.hidden = opts.showTrackInfo === false;
		this.progressRefs.progressRow.hidden = opts.showProgress === false;
		this.controlsRefs.volumeGroup.hidden = opts.showVolume === false;
		this.controlsRefs.shuffleBtn.hidden = opts.showShuffle === false;
		this.controlsRefs.repeatBtn.hidden = opts.showRepeat === false;
		this.controlsRefs.speedBtn.hidden = opts.showSpeed !== true;

		this.applyVolumeMode();
	}
}

export const musicUiPlugin = MusicUiPlugin;
