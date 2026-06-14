// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { CastSenderTranslationKey } from './en';

export default {
	'plugin.cast-sender.casting.track': 'S\'està transmetent "{title}" de {artist}',
	'plugin.cast-sender.casting.album': 'S\'està transmetent l\'àlbum "{album}"',
	'plugin.cast-sender.casting.queue': 'S\'estan transmetent {count} pistes',
	'plugin.cast-sender.action.cast-album': 'Transmet l\'àlbum',
	'plugin.cast-sender.action.cast-queue': 'Transmet la cua',
} satisfies Record<CastSenderTranslationKey, string>;
