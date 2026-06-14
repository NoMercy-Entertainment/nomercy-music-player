// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { CastSenderTranslationKey } from './en';

export default {
	'plugin.cast-sender.casting.track': '«{title}» аз {artist} интиқол мешавад',
	'plugin.cast-sender.casting.album': 'Албоми «{album}» интиқол мешавад',
	'plugin.cast-sender.casting.queue': '{count} суруд интиқол мешавад',
	'plugin.cast-sender.action.cast-album': 'Интиқоли албом',
	'plugin.cast-sender.action.cast-queue': 'Интиқоли навбат',
} satisfies Record<CastSenderTranslationKey, string>;
