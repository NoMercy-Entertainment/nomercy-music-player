// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { CastSenderTranslationKey } from './en';

export default {
	'plugin.cast-sender.casting.track': '{artist} ၏ "{title}" ကို cast လုပ်နေသည်',
	'plugin.cast-sender.casting.album': 'အယ်လ်ဘမ် "{album}" ကို cast လုပ်နေသည်',
	'plugin.cast-sender.casting.queue': 'သီချင်း {count} ပုဒ်ကို cast လုပ်နေသည်',
	'plugin.cast-sender.action.cast-album': 'အယ်လ်ဘမ် cast လုပ်ရန်',
	'plugin.cast-sender.action.cast-queue': 'စီတန်းကို cast လုပ်ရန်',
} satisfies Record<CastSenderTranslationKey, string>;
