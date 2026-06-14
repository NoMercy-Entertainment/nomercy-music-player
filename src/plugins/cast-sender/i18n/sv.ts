// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { CastSenderTranslationKey } from './en';

export default {
	'plugin.cast-sender.casting.track': 'Castar "{title}" av {artist}',
	'plugin.cast-sender.casting.album': 'Castar albumet "{album}"',
	'plugin.cast-sender.casting.queue': 'Castar {count} spår',
	'plugin.cast-sender.action.cast-album': 'Casta album',
	'plugin.cast-sender.action.cast-queue': 'Casta kö',
} satisfies Record<CastSenderTranslationKey, string>;
