// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { CastSenderTranslationKey } from './en';

export default {
	'plugin.cast-sender.casting.track': 'Трансляція «{title}» — {artist}',
	'plugin.cast-sender.casting.album': 'Трансляція альбому «{album}»',
	'plugin.cast-sender.casting.queue': 'Трансляція {count} треків',
	'plugin.cast-sender.action.cast-album': 'Транслювати альбом',
	'plugin.cast-sender.action.cast-queue': 'Транслювати чергу',
} satisfies Record<CastSenderTranslationKey, string>;
