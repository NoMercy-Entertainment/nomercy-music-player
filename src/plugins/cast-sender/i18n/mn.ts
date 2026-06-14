// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { CastSenderTranslationKey } from './en';

export default {
	'plugin.cast-sender.casting.track': '{artist}-ийн "{title}"-г дамжуулж байна',
	'plugin.cast-sender.casting.album': '"{album}" цомгийг дамжуулж байна',
	'plugin.cast-sender.casting.queue': '{count} трек дамжуулж байна',
	'plugin.cast-sender.action.cast-album': 'Цомог дамжуулах',
	'plugin.cast-sender.action.cast-queue': 'Дарааллыг дамжуулах',
} satisfies Record<CastSenderTranslationKey, string>;
