// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { CastSenderTranslationKey } from './en';

export default {
	'plugin.cast-sender.casting.track': '"{title}" castelése – {artist}',
	'plugin.cast-sender.casting.album': '"{album}" album castelése',
	'plugin.cast-sender.casting.queue': '{count} szám castelése',
	'plugin.cast-sender.action.cast-album': 'Album castelése',
	'plugin.cast-sender.action.cast-queue': 'Várólista castelése',
} satisfies Record<CastSenderTranslationKey, string>;
