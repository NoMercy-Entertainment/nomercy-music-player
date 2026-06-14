// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { CastSenderTranslationKey } from './en';

export default {
	'plugin.cast-sender.casting.track': '{artist} ಅವರ "{title}" ಕಾಸ್ಟ್ ಆಗುತ್ತಿದೆ',
	'plugin.cast-sender.casting.album': '"{album}" ಆಲ್ಬಮ್ ಕಾಸ್ಟ್ ಆಗುತ್ತಿದೆ',
	'plugin.cast-sender.casting.queue': '{count} ಟ್ರ್ಯಾಕ್‌ಗಳು ಕಾಸ್ಟ್ ಆಗುತ್ತಿವೆ',
	'plugin.cast-sender.action.cast-album': 'ಆಲ್ಬಮ್ ಕಾಸ್ಟ್ ಮಾಡಿ',
	'plugin.cast-sender.action.cast-queue': 'ಸರತಿ ಕಾಸ್ಟ್ ಮಾಡಿ',
} satisfies Record<CastSenderTranslationKey, string>;
