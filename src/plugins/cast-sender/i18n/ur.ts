// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { CastSenderTranslationKey } from './en';

export default {
	'plugin.cast-sender.casting.track': '{artist} کا "{title}" کاسٹ ہو رہا ہے',
	'plugin.cast-sender.casting.album': 'البم "{album}" کاسٹ ہو رہا ہے',
	'plugin.cast-sender.casting.queue': '{count} ٹریک کاسٹ ہو رہے ہیں',
	'plugin.cast-sender.action.cast-album': 'البم کاسٹ کریں',
	'plugin.cast-sender.action.cast-queue': 'قطار کاسٹ کریں',
} satisfies Record<CastSenderTranslationKey, string>;
