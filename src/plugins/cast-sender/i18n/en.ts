// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * English music-specific cast translations. Picked up by the plugin's glob
 * discovery — drop a sibling `<tag>.ts` to add a language.
 */
export default {
	'plugin.cast-sender.casting.track': 'Casting "{title}" by {artist}',
	'plugin.cast-sender.casting.album': 'Casting album "{album}"',
	'plugin.cast-sender.casting.queue': 'Casting {count} tracks',
	'plugin.cast-sender.action.cast-album': 'Cast album',
	'plugin.cast-sender.action.cast-queue': 'Cast queue',
} satisfies Record<string, string>;
