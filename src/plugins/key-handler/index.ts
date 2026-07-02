// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { NMMusicPlayer } from '../../index';
import type { MusicPlaylistItem } from '../../types';
import { KeyHandlerPlugin as BaseKeyHandler } from '@nomercy-entertainment/nomercy-player-core/plugins/key-handler';
import { RepeatState, ShuffleState } from '../../types';

/**
 * Music-specific key handler. Inherits all kit defaults (space=play/pause,
 * arrows=seek, m=mute) and adds music-specific bindings:
 *
 *  - `n` → next item
 *  - `p` → previous item
 *  - `r` → cycle repeat state (off → all → one → off)
 *  - `s` → toggle shuffle
 */
export class KeyHandlerPlugin<T extends MusicPlaylistItem = MusicPlaylistItem> extends BaseKeyHandler<NMMusicPlayer<T>> {
	static override readonly id: string = 'key-handler';

	/** Only override `addMediaKeys` — kit's default playback / nav / volume groups carry over. */
	protected override addMediaKeys(): void {
		super.addMediaKeys();

		this.bind('n', () => { void this.player.next?.(); });
		this.bind('p', () => { void this.player.previous?.(); });

		this.bind('r', () => {
			const order: ReadonlyArray<RepeatState> = [RepeatState.OFF, RepeatState.ALL, RepeatState.ONE];
			const current = this.player.repeatState?.();
			const nextRepeat = order[(order.indexOf(current ?? RepeatState.OFF) + 1) % order.length] ?? RepeatState.OFF;
			this.player.repeatState?.(nextRepeat);
		});

		this.bind('s', () => {
			const current = this.player.shuffleState?.();
			const next = current === ShuffleState.ON ? ShuffleState.OFF : ShuffleState.ON;
			this.player.shuffleState?.(next);
		});
	}
}

export const keyHandlerPlugin = KeyHandlerPlugin;
