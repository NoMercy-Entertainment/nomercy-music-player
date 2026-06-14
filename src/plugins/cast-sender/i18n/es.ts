// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { CastSenderTranslationKey } from './en';

export default {
	'plugin.cast-sender.casting.track': 'Transmitiendo "{title}" de {artist}',
	'plugin.cast-sender.casting.album': 'Transmitiendo el álbum "{album}"',
	'plugin.cast-sender.casting.queue': 'Transmitiendo {count} pistas',
	'plugin.cast-sender.action.cast-album': 'Transmitir álbum',
	'plugin.cast-sender.action.cast-queue': 'Transmitir cola',
} satisfies Record<CastSenderTranslationKey, string>;
