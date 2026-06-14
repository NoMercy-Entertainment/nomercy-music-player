// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { CastSenderTranslationKey } from './en';

export default {
	'plugin.cast-sender.casting.track': 'A transmitir "{title}" de {artist}',
	'plugin.cast-sender.casting.album': 'A transmitir o álbum "{album}"',
	'plugin.cast-sender.casting.queue': 'A transmitir {count} faixas',
	'plugin.cast-sender.action.cast-album': 'Transmitir álbum',
	'plugin.cast-sender.action.cast-queue': 'Transmitir fila',
} satisfies Record<CastSenderTranslationKey, string>;
