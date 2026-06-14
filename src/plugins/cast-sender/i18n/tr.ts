// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { CastSenderTranslationKey } from './en';

export default {
	'plugin.cast-sender.casting.track': '{artist} sanatçısından "{title}" yayınlanıyor',
	'plugin.cast-sender.casting.album': '"{album}" albümü yayınlanıyor',
	'plugin.cast-sender.casting.queue': '{count} parça yayınlanıyor',
	'plugin.cast-sender.action.cast-album': 'Albümü yayınla',
	'plugin.cast-sender.action.cast-queue': 'Sırayı yayınla',
} satisfies Record<CastSenderTranslationKey, string>;
