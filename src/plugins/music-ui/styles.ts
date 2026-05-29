/**
 * Stylesheet for the music UI plugin.
 *
 * Mounted inside `.nomercymusicplayer` — the kit-managed container that carries
 * all state classes (`playing`, `paused`, `muted`, `buffering`, etc.). The
 * plugin wraps a single overlay div (`.nmmusic-ui`) that occupies the full
 * container. Consumers position the container; the plugin fills it.
 *
 * DOM tree:
 *
 *   .nmmusic-ui
 *     ├─ .nmmusic-art               (album art + crossfade class)
 *     │   ├─ img.nmmusic-art-img
 *     │   └─ .nmmusic-art-placeholder
 *     ├─ .nmmusic-track-info
 *     │   ├─ .nmmusic-track-title
 *     │   ├─ .nmmusic-track-artist
 *     │   └─ .nmmusic-track-album
 *     ├─ .nmmusic-progress-row
 *     │   ├─ .nmmusic-time.nmmusic-current-time
 *     │   ├─ .nmmusic-seek-bar      (role=slider)
 *     │   │   ├─ .nmmusic-seek-buffer
 *     │   │   ├─ .nmmusic-seek-fill
 *     │   │   └─ .nmmusic-seek-thumb
 *     │   └─ .nmmusic-time.nmmusic-duration-time
 *     └─ .nmmusic-controls-row
 *         ├─ .nmmusic-btn[data-action=shuffle]
 *         ├─ .nmmusic-btn[data-action=previous]
 *         ├─ .nmmusic-btn.nmmusic-play-btn[data-action=play]
 *         ├─ .nmmusic-btn[data-action=next]
 *         ├─ .nmmusic-btn[data-action=repeat]
 *         └─ .nmmusic-volume-group
 *             ├─ .nmmusic-btn[data-action=mute]
 *             ├─ input.nmmusic-vol-slider
 *             └─ .nmmusic-vol-slider-vertical (popup)
 *                 ├─ input.nmmusic-vol-slider-vertical-input
 *                 └─ button.nmmusic-vol-popup-mute
 */

export const STYLE_ELEMENT_ID = 'nmmusic-ui-styles';

export const musicUiCss = `
.nmmusic-ui {
    container-type: inline-size;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 16px;
    font-family: system-ui, sans-serif;
    background: #1a1d26;
    color: #fff;
    box-sizing: border-box;
    width: 100%;
    height: 100%;
}

/* ── Album art ──────────────────────────────────────────── */
.nmmusic-art {
    position: relative;
    width: 200px;
    height: 200px;
    border-radius: 12px;
    overflow: hidden;
    background: #252836;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: opacity 0.3s;
    align-self: center;
}
.nmmusic-art.transitioning { opacity: 0.5; }
.nmmusic-art-img {
    position: absolute; 
    width: 100%; 
    height: 100%; 
    object-fit: cover; 
    z-index: 10;
}
.nmmusic-art-placeholder {
    position: absolute;
    color: #444;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    z-index: 0;
}
.nmmusic-art[hidden] { display: none !important; }

/* ── Track info ─────────────────────────────────────────── */
.nmmusic-track-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
}
.nmmusic-track-info[hidden] { display: none !important; }
.nmmusic-track-title {
    font-size: 1.1rem;
    font-weight: 600;
    color: #fff;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin: 0;
}
.nmmusic-track-artist {
    font-size: 0.85rem;
    color: #888;
    margin: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.nmmusic-track-album {
    font-size: 0.75rem;
    color: #555;
    margin: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

/* ── Progress row ───────────────────────────────────────── */
.nmmusic-progress-row {
    display: flex;
    align-items: center;
    gap: 8px;
}
.nmmusic-progress-row[hidden] { display: none !important; }
.nmmusic-time {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.72rem;
    color: #777;
    min-width: 36px;
    user-select: none;
}
.nmmusic-seek-bar {
    position: relative;
    flex: 1;
    height: 4px;
    background: #2a2d3a;
    border-radius: 2px;
    cursor: pointer;
    transition: height 0.12s;
}
.nmmusic-seek-bar:hover { height: 6px; }
.nmmusic-seek-bar[role=slider]:focus-visible {
    outline: 2px solid rgba(108, 99, 255, 0.7);
    outline-offset: 2px;
}
.nmmusic-seek-buffer {
    position: absolute;
    top: 0; left: 0;
    height: 100%;
    width: 0;
    background: rgba(255, 255, 255, 0.25);
    border-radius: 2px;
    pointer-events: none;
    z-index: 1;
}
.nmmusic-seek-fill {
    position: absolute;
    top: 0; left: 0;
    height: 100%;
    width: 0;
    background: #6c63ff;
    border-radius: 2px;
    pointer-events: none;
    z-index: 2;
}
.nmmusic-seek-thumb {
    position: absolute;
    top: 50%;
    left: 0;
    transform: translate(-50%, -50%);
    width: 12px;
    height: 12px;
    background: #fff;
    border-radius: 50%;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.15s;
    z-index: 3;
}
.nmmusic-seek-bar:hover .nmmusic-seek-thumb { opacity: 1; }

/* ── Controls row ───────────────────────────────────────── */
.nmmusic-controls-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    flex-wrap: wrap;
}
.nmmusic-controls-row[hidden] { display: none !important; }

/* ── Buttons ────────────────────────────────────────────── */
.nmmusic-btn {
    background: transparent;
    border: none;
    color: #aaa;
    cursor: pointer;
    padding: 6px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 0.15s, background 0.15s;
    position: relative;
}
.nmmusic-btn:hover { color: #fff; background: rgba(255, 255, 255, 0.07); }
.nmmusic-btn:focus-visible { outline: 2px solid rgba(108, 99, 255, 0.7); outline-offset: -2px; }
.nmmusic-btn[hidden] { display: none !important; }
.nmmusic-btn.active { color: #6c63ff; }
.nmmusic-play-btn {
    color: #fff;
    background: #6c63ff;
    border-radius: 50%;
    width: 40px;
    height: 40px;
}
.nmmusic-play-btn:hover { background: #7d75ff; }

/* ── Responsive button priority ─────────────────────────── */
/* Thresholds use content-box width (.nmmusic-ui has 16px padding on each side,
   so a 280px widget has 248px content width. Tiers are set below that). */
/* tier 3: shuffle + repeat hidden below 230px content width (≈262px widget) */
@container (max-width: 229px) {
    .nmmusic-btn[data-priority="3"] { display: none !important; }
}
/* tier 2: prev + next hidden below 170px content width (≈202px widget) */
@container (max-width: 169px) {
    .nmmusic-btn[data-priority="2"] { display: none !important; }
}
/* tier 1 (volume group) hidden below 130px content width (≈162px widget) */
@container (max-width: 129px) {
    .nmmusic-volume-group { display: none !important; }
}

/* ── Volume group ───────────────────────────────────────── */
.nmmusic-volume-group {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-left: 8px;
}
.nmmusic-volume-group[hidden] { display: none !important; }
.nmmusic-vol-slider {
    -webkit-appearance: none;
    appearance: none;
    width: 72px;
    height: 4px;
    background: #2a2d3a;
    border-radius: 2px;
    outline: none;
    cursor: pointer;
}
.nmmusic-vol-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #6c63ff;
}
.nmmusic-vol-slider::-moz-range-thumb {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #6c63ff;
    border: none;
}

/* ── Speed menu (hidden by default) ─────────────────────── */
.nmmusic-speed-btn[hidden] { display: none !important; }

/* ── Vertical volume popup ──────────────────────────────── */
.nmmusic-volume-group {
    position: relative;
}
.nmmusic-vol-slider-vertical {
    display: none;
    position: absolute;
    bottom: calc(100% + 8px);
    left: 50%;
    transform: translateX(-50%);
    background: #252836;
    border-radius: 8px;
    padding: 12px 8px;
    z-index: 10;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
}
.nmmusic-vol-slider-vertical-open {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
}
.nmmusic-vol-popup-mute {
    min-width: 44px;
    min-height: 44px;
}
.nmmusic-vol-slider-vertical-input {
    -webkit-appearance: slider-vertical;
    appearance: none;
    writing-mode: vertical-lr;
    direction: rtl;
    width: 4px;
    height: 80px;
    background: #2a2d3a;
    border-radius: 2px;
    cursor: pointer;
    outline: none;
}
.nmmusic-vol-slider-vertical-input::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #6c63ff;
}
.nmmusic-vol-slider-vertical-input::-moz-range-thumb {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #6c63ff;
    border: none;
}

/* ── Touch-device hover suppression ─────────────────────── */
@media (hover: none) {
    .nmmusic-btn:hover {
        color: #aaa;
        background: transparent !important;
    }
    .nmmusic-btn.active:hover {
        color: #6c63ff;
    }
    .nmmusic-play-btn:hover {
        background: #6c63ff !important;
        color: #fff;
    }
}
`;

export function ensureMusicUiStyles(): void {
	if (document.getElementById(STYLE_ELEMENT_ID))
		return;
	const style = document.createElement('style');
	style.id = STYLE_ELEMENT_ID;
	style.textContent = musicUiCss;
	document.head.appendChild(style);
}
