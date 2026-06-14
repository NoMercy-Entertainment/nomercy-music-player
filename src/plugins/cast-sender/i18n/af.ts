// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { CastSenderTranslationKey } from './en';

export default {
	'plugin.cast-sender.casting.track': 'Saai "{title}" deur {artist} uit',
	'plugin.cast-sender.casting.album': 'Saai album "{album}" uit',
	'plugin.cast-sender.casting.queue': 'Saai {count} snitte uit',
	'plugin.cast-sender.action.cast-album': 'Saai album uit',
	'plugin.cast-sender.action.cast-queue': 'Saai tou uit',
} satisfies Record<CastSenderTranslationKey, string>;
