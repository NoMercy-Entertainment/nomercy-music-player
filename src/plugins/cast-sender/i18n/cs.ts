// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { CastSenderTranslationKey } from './en';

export default {
	'plugin.cast-sender.casting.track': 'Přenáší se „{title}“ od {artist}',
	'plugin.cast-sender.casting.album': 'Přenáší se album „{album}“',
	'plugin.cast-sender.casting.queue': 'Přenáší se {count} skladeb',
	'plugin.cast-sender.action.cast-album': 'Přenést album',
	'plugin.cast-sender.action.cast-queue': 'Přenést frontu',
} satisfies Record<CastSenderTranslationKey, string>;
