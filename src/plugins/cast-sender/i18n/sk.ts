// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { CastSenderTranslationKey } from './en';

export default {
	'plugin.cast-sender.casting.track': 'Prenáša sa „{title}“ od {artist}',
	'plugin.cast-sender.casting.album': 'Prenáša sa album „{album}“',
	'plugin.cast-sender.casting.queue': 'Prenáša sa {count} skladieb',
	'plugin.cast-sender.action.cast-album': 'Preniesť album',
	'plugin.cast-sender.action.cast-queue': 'Preniesť front',
} satisfies Record<CastSenderTranslationKey, string>;
