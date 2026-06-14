// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { CastSenderTranslationKey } from './en';

export default {
	'plugin.cast-sender.casting.track': 'Sendir út "{title}" með {artist}',
	'plugin.cast-sender.casting.album': 'Sendir út plötuna "{album}"',
	'plugin.cast-sender.casting.queue': 'Sendir út {count} lög',
	'plugin.cast-sender.action.cast-album': 'Senda út plötu',
	'plugin.cast-sender.action.cast-queue': 'Senda út biðröð',
} satisfies Record<CastSenderTranslationKey, string>;
