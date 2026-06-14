// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { CastSenderTranslationKey } from './en';

export default {
	'plugin.cast-sender.casting.track': 'Edastatakse „{title}“ esitajalt {artist}',
	'plugin.cast-sender.casting.album': 'Edastatakse albumit „{album}“',
	'plugin.cast-sender.casting.queue': 'Edastatakse {count} pala',
	'plugin.cast-sender.action.cast-album': 'Edasta album',
	'plugin.cast-sender.action.cast-queue': 'Edasta järjekord',
} satisfies Record<CastSenderTranslationKey, string>;
