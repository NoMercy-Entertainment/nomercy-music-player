/**
 * Regression tests for music-ui mobile UX fixes:
 *
 *   1. Touch seek — touchstart/touchmove/touchend wire scrubbing (not just mouse).
 *   2. Hover suppression CSS injected — @media (hover: none) block present.
 *   3. Volume slider mode option — 'auto' / 'vertical' / 'horizontal' respected.
 *   4. Mute button bail — in vertical volume mode, click opens the popup instead
 *      of toggling mute.
 */

import type { MusicUiOptions } from '../../plugins/music-ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NMMusicPlayer } from '../../index';
import { MusicUiPlugin } from '../../plugins/music-ui';
import { musicUiCss } from '../../plugins/music-ui/styles';

const CONTAINER_ID = 'music-ui-mobile-test';

function setupPlayer(opts?: MusicUiOptions): {
	player: NMMusicPlayer;
	plugin: MusicUiPlugin;
} {
	const player = new NMMusicPlayer(CONTAINER_ID).setup({});
	player.addPlugin(MusicUiPlugin, opts);
	const plugin = player.getPlugin(MusicUiPlugin)!;
	return { player, plugin };
}

describe('MusicUiPlugin — mobile UX fixes', () => {
	beforeEach(() => {
		(NMMusicPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		const div = document.createElement('div');
		div.id = CONTAINER_ID;
		document.body.appendChild(div);
	});

	afterEach(() => {
		(NMMusicPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
		document.body.innerHTML = '';
		document.head.querySelectorAll('[id^="nmmusic"]').forEach(el => el.remove());
	});

	// ── Touch seek ────────────────────────────────────────────────────────────

	describe('touch seek scrub', () => {
		it('wires touchstart on the seek bar without throwing', async () => {
			const { player } = setupPlayer();
			await player.ready();

			const seekBar = document.querySelector('.nmmusic-seek-bar') as HTMLElement | null;
			expect(seekBar).not.toBeNull();

			// touchAction is set to prevent browser scroll interception.
			expect(seekBar!.style.touchAction).toBe('none');
		});

		it('dispatches currentTime on touchstart with a clientX inside the bar', async () => {
			const { player } = setupPlayer();
			await player.ready();

			// Force a known duration so the ratio math is deterministic.
			player.emit('duration', { duration: 100 });

			const seekBar = document.querySelector('.nmmusic-seek-bar') as HTMLElement;
			vi.spyOn(seekBar, 'getBoundingClientRect').mockReturnValue({
				left: 0,
				right: 200,
				width: 200,
				top: 0,
				bottom: 10,
				height: 10,
				x: 0,
				y: 0,
				toJSON: () => ({}),
			});

			const seekSpy = vi.spyOn(player, 'currentTime');

			seekBar.dispatchEvent(new TouchEvent('touchstart', {
				touches: [new Touch({ identifier: 1, target: seekBar, clientX: 100, clientY: 5 })],
				bubbles: true,
			}));

			// clientX=100 on a 200px bar starting at left=0 → ratio 0.5 → time 50.
			expect(seekSpy).toHaveBeenCalledWith(50);
		});
	});

	// ── Hover suppression CSS ─────────────────────────────────────────────────

	describe('hover suppression CSS', () => {
		it('musicUiCss contains @media (hover: none) block', () => {
			expect(musicUiCss).toContain('@media (hover: none)');
		});

		it('hover-suppression block targets .nmmusic-btn:hover', () => {
			expect(musicUiCss).toContain('.nmmusic-btn:hover');
		});

		it('preserves .nmmusic-play-btn background in hover suppression block', () => {
			const hoverNoneBlock = musicUiCss.slice(musicUiCss.indexOf('@media (hover: none)'));
			expect(hoverNoneBlock).toContain('.nmmusic-play-btn:hover');
		});
	});

	// ── Volume slider modes ───────────────────────────────────────────────────

	describe('volumeSlider option', () => {
		it('horizontal mode: horizontal slider visible, vertical popup hidden', async () => {
			const { player } = setupPlayer({ volumeSlider: 'horizontal' });
			await player.ready();

			const volSlider = document.querySelector('.nmmusic-vol-slider') as HTMLInputElement | null;
			const volVertical = document.querySelector('.nmmusic-vol-slider-vertical') as HTMLElement | null;

			expect(volSlider).not.toBeNull();
			expect(volVertical).not.toBeNull();
			expect(volSlider!.hidden).toBe(false);
			expect(volVertical!.classList.contains('nmmusic-vol-slider-vertical-open')).toBe(false);
		});

		it('vertical mode: horizontal slider hidden, vertical popup present', async () => {
			const { player } = setupPlayer({ volumeSlider: 'vertical' });
			await player.ready();

			const volGroup = document.querySelector('.nmmusic-volume-group') as HTMLElement;
			const volSlider = document.querySelector('.nmmusic-vol-slider') as HTMLInputElement;

			expect(volGroup.classList.contains('nmmusic-volume-group-vertical')).toBe(true);
			expect(volSlider.hidden).toBe(true);
		});
	});

	// ── Mute button bail in vertical mode ─────────────────────────────────────

	describe('mute button bail in vertical slider mode', () => {
		it('does not call toggleMute when volume group is in vertical mode', async () => {
			const { player } = setupPlayer({ volumeSlider: 'vertical' });
			await player.ready();

			const toggleMuteSpy = vi.spyOn(player, 'toggleMute');
			const muteBtn = document.querySelector('[data-action="mute"]') as HTMLButtonElement | null;
			expect(muteBtn).not.toBeNull();

			muteBtn!.click();

			expect(toggleMuteSpy).not.toHaveBeenCalled();
		});

		it('opens the vertical popup on first mute-button click in vertical mode', async () => {
			const { player } = setupPlayer({ volumeSlider: 'vertical' });
			await player.ready();

			const muteBtn = document.querySelector('[data-action="mute"]') as HTMLButtonElement;
			const volVertical = document.querySelector('.nmmusic-vol-slider-vertical') as HTMLElement;

			expect(volVertical.classList.contains('nmmusic-vol-slider-vertical-open')).toBe(false);
			muteBtn.click();
			expect(volVertical.classList.contains('nmmusic-vol-slider-vertical-open')).toBe(true);
		});

		it('closes the vertical popup on second mute-button click in vertical mode', async () => {
			const { player } = setupPlayer({ volumeSlider: 'vertical' });
			await player.ready();

			const muteBtn = document.querySelector('[data-action="mute"]') as HTMLButtonElement;
			const volVertical = document.querySelector('.nmmusic-vol-slider-vertical') as HTMLElement;

			muteBtn.click(); // open
			muteBtn.click(); // close
			expect(volVertical.classList.contains('nmmusic-vol-slider-vertical-open')).toBe(false);
		});

		it('calls toggleMute normally in horizontal mode', async () => {
			const { player } = setupPlayer({ volumeSlider: 'horizontal' });
			await player.ready();

			const toggleMuteSpy = vi.spyOn(player, 'toggleMute');
			const muteBtn = document.querySelector('[data-action="mute"]') as HTMLButtonElement;
			muteBtn.click();

			expect(toggleMuteSpy).toHaveBeenCalledOnce();
		});
	});

	// ── Volume event syncs vertical input ─────────────────────────────────────

	describe('volume event syncs vertical slider input', () => {
		it('updates volSliderVerticalInput when volume event fires', async () => {
			const { player } = setupPlayer({ volumeSlider: 'vertical' });
			await player.ready();

			const vertInput = document.querySelector('.nmmusic-vol-slider-vertical-input') as HTMLInputElement;
			player.emit('volume', { level: 60 });

			expect(vertInput.value).toBe('60');
		});
	});

	// ── In-popup mute button ───────────────────────────────────────────────────

	describe('in-popup mute button', () => {
		it('renders .nmmusic-vol-popup-mute inside .nmmusic-vol-slider-vertical', async () => {
			const { player } = setupPlayer({ volumeSlider: 'vertical' });
			await player.ready();

			const popup = document.querySelector('.nmmusic-vol-slider-vertical');
			expect(popup).not.toBeNull();

			const popupMuteBtn = popup!.querySelector('.nmmusic-vol-popup-mute');
			expect(popupMuteBtn).not.toBeNull();
		});

		it('calls toggleMute when the popup mute button is clicked', async () => {
			const { player } = setupPlayer({ volumeSlider: 'vertical' });
			await player.ready();

			const toggleMuteSpy = vi.spyOn(player, 'toggleMute');
			const popupMuteBtn = document.querySelector<HTMLButtonElement>('.nmmusic-vol-popup-mute');
			expect(popupMuteBtn).not.toBeNull();

			popupMuteBtn!.click();

			expect(toggleMuteSpy).toHaveBeenCalledOnce();
		});

		it('does NOT close the popup when the in-popup mute button is clicked', async () => {
			const { player } = setupPlayer({ volumeSlider: 'vertical' });
			await player.ready();

			// Open the popup.
			const muteBtn = document.querySelector<HTMLButtonElement>('[data-action="mute"]')!;
			muteBtn.click();

			const popup = document.querySelector('.nmmusic-vol-slider-vertical')!;
			expect(popup.classList.contains('nmmusic-vol-slider-vertical-open')).toBe(true);

			// Click the in-popup mute button — propagation is stopped so popup stays open.
			const popupMuteBtn = popup.querySelector<HTMLButtonElement>('.nmmusic-vol-popup-mute')!;
			popupMuteBtn.click();

			expect(popup.classList.contains('nmmusic-vol-slider-vertical-open')).toBe(true);
		});

		it('updates popup mute icon when mute event fires', async () => {
			const { player } = setupPlayer({ volumeSlider: 'vertical' });
			await player.ready();

			const popupMuteBtn = document.querySelector<HTMLButtonElement>('.nmmusic-vol-popup-mute')!;

			player.emit('mute', { muted: true });
			const mutedHtml = popupMuteBtn.innerHTML;

			player.emit('mute', { muted: false });
			const unmutedHtml = popupMuteBtn.innerHTML;

			expect(mutedHtml).not.toBe(unmutedHtml);
		});

		it('syncs popup mute aria-label on mute event', async () => {
			const { player } = setupPlayer({ volumeSlider: 'vertical' });
			await player.ready();

			const popupMuteBtn = document.querySelector<HTMLButtonElement>('.nmmusic-vol-popup-mute')!;

			player.emit('mute', { muted: true });
			const mutedLabel = popupMuteBtn.getAttribute('aria-label');

			player.emit('mute', { muted: false });
			const unmutedLabel = popupMuteBtn.getAttribute('aria-label');

			expect(mutedLabel).toBeTruthy();
			expect(unmutedLabel).toBeTruthy();
			// The plugin uses different translation keys for muted vs unmuted.
			expect(mutedLabel).not.toBe(unmutedLabel);
		});

		it('is present in auto mode as well (always constructed)', async () => {
			const { player } = setupPlayer({ volumeSlider: 'auto' });
			await player.ready();

			const popup = document.querySelector('.nmmusic-vol-slider-vertical');
			const popupMuteBtn = popup?.querySelector('.nmmusic-vol-popup-mute');
			expect(popupMuteBtn).not.toBeNull();
		});
	});
});
