// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { CastSenderTranslationKey } from './en';

export default {
	'plugin.cast-sender.casting.track': 'Преноси се „{title}“ извођача {artist}',
	'plugin.cast-sender.casting.album': 'Преноси се албум „{album}“',
	'plugin.cast-sender.casting.queue': 'Преноси се {count} нумера',
	'plugin.cast-sender.action.cast-album': 'Пренеси албум',
	'plugin.cast-sender.action.cast-queue': 'Пренеси ред',
} satisfies Record<CastSenderTranslationKey, string>;
