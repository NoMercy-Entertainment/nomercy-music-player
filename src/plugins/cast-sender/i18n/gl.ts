// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { CastSenderTranslationKey } from './en';

export default {
	'plugin.cast-sender.casting.track': 'Emitindo "{title}" de {artist}',
	'plugin.cast-sender.casting.album': 'Emitindo o álbum "{album}"',
	'plugin.cast-sender.casting.queue': 'Emitindo {count} pistas',
	'plugin.cast-sender.action.cast-album': 'Emitir álbum',
	'plugin.cast-sender.action.cast-queue': 'Emitir a cola',
} satisfies Record<CastSenderTranslationKey, string>;
