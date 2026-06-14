// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { CastSenderTranslationKey } from './en';

export default {
	'plugin.cast-sender.casting.track': '{artist} এর "{title}" কাস্ট করা হচ্ছে',
	'plugin.cast-sender.casting.album': 'অ্যালবাম "{album}" কাস্ট করা হচ্ছে',
	'plugin.cast-sender.casting.queue': '{count}টি ট্র্যাক কাস্ট করা হচ্ছে',
	'plugin.cast-sender.action.cast-album': 'অ্যালবাম কাস্ট করুন',
	'plugin.cast-sender.action.cast-queue': 'সারি কাস্ট করুন',
} satisfies Record<CastSenderTranslationKey, string>;
