// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { CastSenderTranslationKey } from './en';

export default {
	'plugin.cast-sender.casting.track': 'Po transmetohet "{title}" nga {artist}',
	'plugin.cast-sender.casting.album': 'Po transmetohet albumi "{album}"',
	'plugin.cast-sender.casting.queue': 'Po transmetohen {count} pjesë',
	'plugin.cast-sender.action.cast-album': 'Transmeto albumin',
	'plugin.cast-sender.action.cast-queue': 'Transmeto radhën',
} satisfies Record<CastSenderTranslationKey, string>;
