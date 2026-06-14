// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { CastSenderTranslationKey } from './en';

export default {
	'plugin.cast-sender.casting.track': 'Perduodama „{title}“, atlieka {artist}',
	'plugin.cast-sender.casting.album': 'Perduodamas albumas „{album}“',
	'plugin.cast-sender.casting.queue': 'Perduodama {count} takelių',
	'plugin.cast-sender.action.cast-album': 'Perduoti albumą',
	'plugin.cast-sender.action.cast-queue': 'Perduoti eilę',
} satisfies Record<CastSenderTranslationKey, string>;
