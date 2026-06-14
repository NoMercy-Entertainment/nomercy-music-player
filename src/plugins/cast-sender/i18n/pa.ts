// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { CastSenderTranslationKey } from './en';

export default {
	'plugin.cast-sender.casting.track': '{artist} ਦਾ "{title}" ਕਾਸਟ ਹੋ ਰਿਹਾ ਹੈ',
	'plugin.cast-sender.casting.album': 'ਐਲਬਮ "{album}" ਕਾਸਟ ਹੋ ਰਿਹਾ ਹੈ',
	'plugin.cast-sender.casting.queue': '{count} ਟਰੈਕ ਕਾਸਟ ਹੋ ਰਹੇ ਹਨ',
	'plugin.cast-sender.action.cast-album': 'ਐਲਬਮ ਕਾਸਟ ਕਰੋ',
	'plugin.cast-sender.action.cast-queue': 'ਕਤਾਰ ਕਾਸਟ ਕਰੋ',
} satisfies Record<CastSenderTranslationKey, string>;
