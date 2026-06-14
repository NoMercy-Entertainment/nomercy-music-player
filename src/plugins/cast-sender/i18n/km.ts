// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { CastSenderTranslationKey } from './en';

export default {
	'plugin.cast-sender.casting.track': 'កំពុងបញ្ជូន "{title}" ដោយ {artist}',
	'plugin.cast-sender.casting.album': 'កំពុងបញ្ជូនអាល់ប៊ុម "{album}"',
	'plugin.cast-sender.casting.queue': 'កំពុងបញ្ជូន {count} បទ',
	'plugin.cast-sender.action.cast-album': 'បញ្ជូនអាល់ប៊ុម',
	'plugin.cast-sender.action.cast-queue': 'បញ្ជូនជួរ',
} satisfies Record<CastSenderTranslationKey, string>;
