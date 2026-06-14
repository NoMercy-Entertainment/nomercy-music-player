// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { CastSenderTranslationKey } from './en';

export default {
	'plugin.cast-sender.casting.track': '{artist} ijrosidagi "{title}" translatsiya qilinmoqda',
	'plugin.cast-sender.casting.album': '"{album}" albomi translatsiya qilinmoqda',
	'plugin.cast-sender.casting.queue': '{count} ta trek translatsiya qilinmoqda',
	'plugin.cast-sender.action.cast-album': 'Albomni translatsiya qilish',
	'plugin.cast-sender.action.cast-queue': 'Navbatni translatsiya qilish',
} satisfies Record<CastSenderTranslationKey, string>;
