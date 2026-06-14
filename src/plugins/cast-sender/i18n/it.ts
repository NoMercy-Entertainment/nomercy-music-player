// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { CastSenderTranslationKey } from './en';

export default {
	'plugin.cast-sender.casting.track': 'Trasmissione di "{title}" di {artist}',
	'plugin.cast-sender.casting.album': 'Trasmissione dell\'album "{album}"',
	'plugin.cast-sender.casting.queue': 'Trasmissione di {count} tracce',
	'plugin.cast-sender.action.cast-album': 'Trasmetti album',
	'plugin.cast-sender.action.cast-queue': 'Trasmetti coda',
} satisfies Record<CastSenderTranslationKey, string>;
