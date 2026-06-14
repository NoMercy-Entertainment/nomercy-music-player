// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { CastSenderTranslationKey } from './en';

export default {
	'plugin.cast-sender.casting.track': '"{title}" ya {artist} tê weşandin',
	'plugin.cast-sender.casting.album': 'Albûma "{album}" tê weşandin',
	'plugin.cast-sender.casting.queue': '{count} stran tê weşandin',
	'plugin.cast-sender.action.cast-album': 'Albûmê biweşîne',
	'plugin.cast-sender.action.cast-queue': 'Rêzê biweşîne',
} satisfies Record<CastSenderTranslationKey, string>;
