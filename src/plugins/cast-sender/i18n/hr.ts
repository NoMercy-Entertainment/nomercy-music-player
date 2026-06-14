// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { CastSenderTranslationKey } from './en';

export default {
	'plugin.cast-sender.casting.track': 'Emitiranje "{title}" izvođača {artist}',
	'plugin.cast-sender.casting.album': 'Emitiranje albuma "{album}"',
	'plugin.cast-sender.casting.queue': 'Emitiranje {count} pjesama',
	'plugin.cast-sender.action.cast-album': 'Emitiraj album',
	'plugin.cast-sender.action.cast-queue': 'Emitiraj red čekanja',
} satisfies Record<CastSenderTranslationKey, string>;
