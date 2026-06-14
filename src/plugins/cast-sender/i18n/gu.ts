// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { CastSenderTranslationKey } from './en';

export default {
	'plugin.cast-sender.casting.track': '{artist} દ્વારા "{title}" કાસ્ટ થઈ રહ્યું છે',
	'plugin.cast-sender.casting.album': 'આલ્બમ "{album}" કાસ્ટ થઈ રહ્યું છે',
	'plugin.cast-sender.casting.queue': '{count} ટ્રેક કાસ્ટ થઈ રહ્યા છે',
	'plugin.cast-sender.action.cast-album': 'આલ્બમ કાસ્ટ કરો',
	'plugin.cast-sender.action.cast-queue': 'કતાર કાસ્ટ કરો',
} satisfies Record<CastSenderTranslationKey, string>;
