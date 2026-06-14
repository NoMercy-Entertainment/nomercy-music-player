// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { CastSenderTranslationKey } from './en';

export default {
	'plugin.cast-sender.casting.track': 'Isasaza i-"{title}" ka-{artist}',
	'plugin.cast-sender.casting.album': 'Isasaza i-albhamu "{album}"',
	'plugin.cast-sender.casting.queue': 'Isasaza iingoma ezingu-{count}',
	'plugin.cast-sender.action.cast-album': 'Sasaza i-albhamu',
	'plugin.cast-sender.action.cast-queue': 'Sasaza umgca',
} satisfies Record<CastSenderTranslationKey, string>;
