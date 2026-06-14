// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { CastSenderTranslationKey } from './en';

export default {
	'plugin.cast-sender.casting.track': '{artist} орындауындағы «{title}» таратылуда',
	'plugin.cast-sender.casting.album': '«{album}» альбомы таратылуда',
	'plugin.cast-sender.casting.queue': '{count} трек таратылуда',
	'plugin.cast-sender.action.cast-album': 'Альбомды тарату',
	'plugin.cast-sender.action.cast-queue': 'Кезекті тарату',
} satisfies Record<CastSenderTranslationKey, string>;
