// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { CastSenderTranslationKey } from './en';

export default {
	'plugin.cast-sender.casting.track': '{artist} యొక్క "{title}" క్యాస్ట్ అవుతోంది',
	'plugin.cast-sender.casting.album': '"{album}" ఆల్బమ్ క్యాస్ట్ అవుతోంది',
	'plugin.cast-sender.casting.queue': '{count} ట్రాక్‌లు క్యాస్ట్ అవుతున్నాయి',
	'plugin.cast-sender.action.cast-album': 'ఆల్బమ్‌ను క్యాస్ట్ చేయండి',
	'plugin.cast-sender.action.cast-queue': 'క్యూను క్యాస్ట్ చేయండి',
} satisfies Record<CastSenderTranslationKey, string>;
