// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { CastSenderTranslationKey } from './en';

export default {
	'plugin.cast-sender.casting.track': 'Se difuzează "{title}" de {artist}',
	'plugin.cast-sender.casting.album': 'Se difuzează albumul "{album}"',
	'plugin.cast-sender.casting.queue': 'Se difuzează {count} piese',
	'plugin.cast-sender.action.cast-album': 'Difuzează albumul',
	'plugin.cast-sender.action.cast-queue': 'Difuzează coada',
} satisfies Record<CastSenderTranslationKey, string>;
