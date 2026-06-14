// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { CastSenderTranslationKey } from './en';

export default {
	'plugin.cast-sender.casting.track': '{artist} द्वारा "{title}" कास्ट हो रहा है',
	'plugin.cast-sender.casting.album': 'एल्बम "{album}" कास्ट हो रहा है',
	'plugin.cast-sender.casting.queue': '{count} ट्रैक कास्ट हो रहे हैं',
	'plugin.cast-sender.action.cast-album': 'एल्बम कास्ट करें',
	'plugin.cast-sender.action.cast-queue': 'कतार कास्ट करें',
} satisfies Record<CastSenderTranslationKey, string>;
