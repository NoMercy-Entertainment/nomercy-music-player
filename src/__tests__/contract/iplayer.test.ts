import { runIPlayerContract } from '@nomercy-entertainment/nomercy-player-core/testing';
import { afterEach, beforeEach } from 'vitest';
import { nmMPlayer, NMMusicPlayer } from '../../index';

/**
 * Validates that `NMMusicPlayer` satisfies the `IPlayer` **behavior** contract.
 * Same suite `StubPlayer` and `NMVideoPlayer` run against themselves. This is
 * the first line of regression defence for the cross-cutting player surface
 * (events, phase, baseUrl, audioContext, experimental, i18n, cue parsers).
 */
beforeEach(() => {
	(NMMusicPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
	const div = document.createElement('div');
	div.id = 'contract-music';
	document.body.appendChild(div);
});

afterEach(() => {
	document.body.innerHTML = '';
	(NMMusicPlayer as unknown as { _resetRegistry: () => void })._resetRegistry();
});

runIPlayerContract({
	create: () => nmMPlayer('contract-music').setup({}),
	label: 'NMMusicPlayer',
});
