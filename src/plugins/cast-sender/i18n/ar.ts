// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { CastSenderTranslationKey } from './en';

export default {
	'plugin.cast-sender.casting.track': 'جارٍ إرسال "{title}" لـ {artist}',
	'plugin.cast-sender.casting.album': 'جارٍ إرسال الألبوم "{album}"',
	'plugin.cast-sender.casting.queue': 'جارٍ إرسال {count} مقطع',
	'plugin.cast-sender.action.cast-album': 'إرسال الألبوم',
	'plugin.cast-sender.action.cast-queue': 'إرسال قائمة الانتظار',
} satisfies Record<CastSenderTranslationKey, string>;
