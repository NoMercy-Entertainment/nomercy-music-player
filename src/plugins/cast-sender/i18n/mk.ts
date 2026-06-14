// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { CastSenderTranslationKey } from './en';

export default {
	'plugin.cast-sender.casting.track': 'Се пренесува „{title}“ од {artist}',
	'plugin.cast-sender.casting.album': 'Се пренесува албумот „{album}“',
	'plugin.cast-sender.casting.queue': 'Се пренесуваат {count} песни',
	'plugin.cast-sender.action.cast-album': 'Пренеси албум',
	'plugin.cast-sender.action.cast-queue': 'Пренеси редица',
} satisfies Record<CastSenderTranslationKey, string>;
