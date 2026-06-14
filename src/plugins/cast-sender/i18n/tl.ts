// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { CastSenderTranslationKey } from './en';

export default {
	'plugin.cast-sender.casting.track': 'Kina-cast ang "{title}" ni {artist}',
	'plugin.cast-sender.casting.album': 'Kina-cast ang album na "{album}"',
	'plugin.cast-sender.casting.queue': 'Kina-cast ang {count} na track',
	'plugin.cast-sender.action.cast-album': 'I-cast ang album',
	'plugin.cast-sender.action.cast-queue': 'I-cast ang queue',
} satisfies Record<CastSenderTranslationKey, string>;
