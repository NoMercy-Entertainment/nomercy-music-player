// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { CastSenderTranslationKey } from './en';

export default {
	'plugin.cast-sender.casting.track': 'Przesyłanie „{title}” – {artist}',
	'plugin.cast-sender.casting.album': 'Przesyłanie albumu „{album}”',
	'plugin.cast-sender.casting.queue': 'Przesyłanie {count} utworów',
	'plugin.cast-sender.action.cast-album': 'Prześlij album',
	'plugin.cast-sender.action.cast-queue': 'Prześlij kolejkę',
} satisfies Record<CastSenderTranslationKey, string>;
