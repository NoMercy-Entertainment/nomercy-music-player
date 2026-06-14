// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { CastSenderTranslationKey } from './en';

export default {
	'plugin.cast-sender.casting.track': 'Predvajanje "{title}" izvajalca {artist}',
	'plugin.cast-sender.casting.album': 'Predvajanje albuma "{album}"',
	'plugin.cast-sender.casting.queue': 'Predvajanje {count} skladb',
	'plugin.cast-sender.action.cast-album': 'Predvajaj album',
	'plugin.cast-sender.action.cast-queue': 'Predvajaj čakalno vrsto',
} satisfies Record<CastSenderTranslationKey, string>;
