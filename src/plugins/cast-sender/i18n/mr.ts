// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { CastSenderTranslationKey } from './en';

export default {
	'plugin.cast-sender.casting.track': '{artist} चे "{title}" कास्ट होत आहे',
	'plugin.cast-sender.casting.album': '"{album}" अल्बम कास्ट होत आहे',
	'plugin.cast-sender.casting.queue': '{count} ट्रॅक कास्ट होत आहेत',
	'plugin.cast-sender.action.cast-album': 'अल्बम कास्ट करा',
	'plugin.cast-sender.action.cast-queue': 'रांग कास्ट करा',
} satisfies Record<CastSenderTranslationKey, string>;
