import type { NMMusicPlayer } from '../../index';
import { KeyHandlerPlugin as BaseKeyHandler } from '@nomercy-entertainment/nomercy-player-core/plugins/key-handler';
import { RepeatState, ShuffleState } from '../../types';

/**
 * Music-specific key handler. Inherits all kit defaults (space=play/pause,
 * arrows=seek, m=mute) and adds music-specific bindings:
 *
 *  - `n` → next track
 *  - `p` → previous track
 *  - `r` → cycle repeat state (off → all → one → off)
 *  - `s` → toggle shuffle
 */
export class KeyHandlerPlugin extends BaseKeyHandler<NMMusicPlayer<any>> {
	static override readonly id: string = 'key-handler';

	/** Only override `addMediaKeys` — kit's default playback / nav / volume groups carry over. */
	protected override addMediaKeys(): void {
		super.addMediaKeys();

		this.bind('n', () => { void this.player.next?.(); });
		this.bind('p', () => { void this.player.previous?.(); });

		this.bind('r', () => {
			const current = this.player.repeatState?.();
			let next: RepeatState;
			switch (current) {
				case RepeatState.OFF:
					next = RepeatState.ALL;
					break;
				case RepeatState.ALL:
					next = RepeatState.ONE;
					break;
				default:
					next = RepeatState.OFF;
					break;
			}
			this.player.repeatState?.(next);
		});

		this.bind('s', () => {
			const current = this.player.shuffleState?.();
			const next = current === ShuffleState.ON ? ShuffleState.OFF : ShuffleState.ON;
			this.player.shuffleState?.(next);
		});
	}
}

export const keyHandlerPlugin = KeyHandlerPlugin;
