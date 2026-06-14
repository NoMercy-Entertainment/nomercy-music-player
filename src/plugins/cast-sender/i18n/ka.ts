// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { CastSenderTranslationKey } from './en';

export default {
	'plugin.cast-sender.casting.track': 'ტრანსლირდება „{title}“ — {artist}',
	'plugin.cast-sender.casting.album': 'ტრანსლირდება ალბომი „{album}“',
	'plugin.cast-sender.casting.queue': 'ტრანსლირდება {count} ტრეკი',
	'plugin.cast-sender.action.cast-album': 'ალბომის ტრანსლაცია',
	'plugin.cast-sender.action.cast-queue': 'რიგის ტრანსლაცია',
} satisfies Record<CastSenderTranslationKey, string>;
