// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { CastSenderTranslationKey } from './en';

export default {
	'plugin.cast-sender.casting.track': 'Menyiarkan "{title}" oleh {artist}',
	'plugin.cast-sender.casting.album': 'Menyiarkan album "{album}"',
	'plugin.cast-sender.casting.queue': 'Menyiarkan {count} lagu',
	'plugin.cast-sender.action.cast-album': 'Cast album',
	'plugin.cast-sender.action.cast-queue': 'Cast antrean',
} satisfies Record<CastSenderTranslationKey, string>;
