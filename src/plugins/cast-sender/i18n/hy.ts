// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { CastSenderTranslationKey } from './en';

export default {
	'plugin.cast-sender.casting.track': 'Հեռարձակվում է «{title}» {artist}-ի կողմից',
	'plugin.cast-sender.casting.album': 'Հեռարձակվում է «{album}» ալբոմը',
	'plugin.cast-sender.casting.queue': 'Հեռարձակվում է {count} երգ',
	'plugin.cast-sender.action.cast-album': 'Հեռարձակել ալբոմը',
	'plugin.cast-sender.action.cast-queue': 'Հեռարձակել հերթը',
} satisfies Record<CastSenderTranslationKey, string>;
