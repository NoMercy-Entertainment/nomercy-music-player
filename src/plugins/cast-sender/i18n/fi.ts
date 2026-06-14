// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { CastSenderTranslationKey } from './en';

export default {
	'plugin.cast-sender.casting.track': 'Lähetetään "{title}" – {artist}',
	'plugin.cast-sender.casting.album': 'Lähetetään albumia "{album}"',
	'plugin.cast-sender.casting.queue': 'Lähetetään {count} kappaletta',
	'plugin.cast-sender.action.cast-album': 'Lähetä albumi',
	'plugin.cast-sender.action.cast-queue': 'Lähetä jono',
} satisfies Record<CastSenderTranslationKey, string>;
