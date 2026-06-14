// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { CastSenderTranslationKey } from './en';

export default {
	'plugin.cast-sender.casting.track': '"{title}" igortzen, {artist}',
	'plugin.cast-sender.casting.album': '"{album}" albuma igortzen',
	'plugin.cast-sender.casting.queue': '{count} pista igortzen',
	'plugin.cast-sender.action.cast-album': 'Igorri albuma',
	'plugin.cast-sender.action.cast-queue': 'Igorri ilara',
} satisfies Record<CastSenderTranslationKey, string>;
