// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { CastSenderTranslationKey } from './en';

export default {
	'plugin.cast-sender.casting.track': 'Μετάδοση «{title}» από {artist}',
	'plugin.cast-sender.casting.album': 'Μετάδοση άλμπουμ «{album}»',
	'plugin.cast-sender.casting.queue': 'Μετάδοση {count} κομματιών',
	'plugin.cast-sender.action.cast-album': 'Μετάδοση άλμπουμ',
	'plugin.cast-sender.action.cast-queue': 'Μετάδοση ουράς',
} satisfies Record<CastSenderTranslationKey, string>;
