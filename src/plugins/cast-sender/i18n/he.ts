// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { CastSenderTranslationKey } from './en';

export default {
	'plugin.cast-sender.casting.track': 'מזרים את "{title}" מאת {artist}',
	'plugin.cast-sender.casting.album': 'מזרים את האלבום "{album}"',
	'plugin.cast-sender.casting.queue': 'מזרים {count} רצועות',
	'plugin.cast-sender.action.cast-album': 'הזרמת אלבום',
	'plugin.cast-sender.action.cast-queue': 'הזרמת התור',
} satisfies Record<CastSenderTranslationKey, string>;
