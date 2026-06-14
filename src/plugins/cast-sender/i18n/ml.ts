// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { CastSenderTranslationKey } from './en';

export default {
	'plugin.cast-sender.casting.track': '{artist} ന്റെ "{title}" കാസ്റ്റ് ചെയ്യുന്നു',
	'plugin.cast-sender.casting.album': '"{album}" ആൽബം കാസ്റ്റ് ചെയ്യുന്നു',
	'plugin.cast-sender.casting.queue': '{count} ട്രാക്കുകൾ കാസ്റ്റ് ചെയ്യുന്നു',
	'plugin.cast-sender.action.cast-album': 'ആൽബം കാസ്റ്റ് ചെയ്യുക',
	'plugin.cast-sender.action.cast-queue': 'ക്യൂ കാസ്റ്റ് ചെയ്യുക',
} satisfies Record<CastSenderTranslationKey, string>;
