// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { CastSenderTranslationKey } from './en';

export default {
	'plugin.cast-sender.casting.track': 'Трансляция «{title}» — {artist}',
	'plugin.cast-sender.casting.album': 'Трансляция альбома «{album}»',
	'plugin.cast-sender.casting.queue': 'Трансляция {count} треков',
	'plugin.cast-sender.action.cast-album': 'Транслировать альбом',
	'plugin.cast-sender.action.cast-queue': 'Транслировать очередь',
} satisfies Record<CastSenderTranslationKey, string>;
