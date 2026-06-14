// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { CastSenderTranslationKey } from './en';

export default {
	'plugin.cast-sender.casting.track': '"{title}" von {artist} wird gecastet',
	'plugin.cast-sender.casting.album': 'Album "{album}" wird gecastet',
	'plugin.cast-sender.casting.queue': '{count} Titel werden gecastet',
	'plugin.cast-sender.action.cast-album': 'Album casten',
	'plugin.cast-sender.action.cast-queue': 'Warteschlange casten',
} satisfies Record<CastSenderTranslationKey, string>;
