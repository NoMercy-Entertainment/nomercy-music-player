// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { CastSenderTranslationKey } from './en';

export default {
	'plugin.cast-sender.casting.track': 'در حال پخش «{title}» از {artist}',
	'plugin.cast-sender.casting.album': 'در حال پخش آلبوم «{album}»',
	'plugin.cast-sender.casting.queue': 'در حال پخش {count} آهنگ',
	'plugin.cast-sender.action.cast-album': 'پخش آلبوم',
	'plugin.cast-sender.action.cast-queue': 'پخش صف',
} satisfies Record<CastSenderTranslationKey, string>;
