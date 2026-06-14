// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { CastSenderTranslationKey } from './en';

export default {
	'plugin.cast-sender.casting.track': 'Inatangaza "{title}" na {artist}',
	'plugin.cast-sender.casting.album': 'Inatangaza albamu "{album}"',
	'plugin.cast-sender.casting.queue': 'Inatangaza nyimbo {count}',
	'plugin.cast-sender.action.cast-album': 'Tangaza albamu',
	'plugin.cast-sender.action.cast-queue': 'Tangaza foleni',
} satisfies Record<CastSenderTranslationKey, string>;
