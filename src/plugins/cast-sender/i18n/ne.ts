// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { CastSenderTranslationKey } from './en';

export default {
	'plugin.cast-sender.casting.track': '{artist} द्वारा "{title}" कास्ट हुँदै',
	'plugin.cast-sender.casting.album': 'एल्बम "{album}" कास्ट हुँदै',
	'plugin.cast-sender.casting.queue': '{count} ट्र्याक कास्ट हुँदै',
	'plugin.cast-sender.action.cast-album': 'एल्बम कास्ट गर्नुहोस्',
	'plugin.cast-sender.action.cast-queue': 'लाम कास्ट गर्नुहोस्',
} satisfies Record<CastSenderTranslationKey, string>;
