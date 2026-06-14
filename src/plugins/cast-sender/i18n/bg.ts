// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { CastSenderTranslationKey } from './en';

export default {
	'plugin.cast-sender.casting.track': 'Предаване на „{title}“ от {artist}',
	'plugin.cast-sender.casting.album': 'Предаване на албум „{album}“',
	'plugin.cast-sender.casting.queue': 'Предаване на {count} записа',
	'plugin.cast-sender.action.cast-album': 'Предаване на албум',
	'plugin.cast-sender.action.cast-queue': 'Предаване на опашката',
} satisfies Record<CastSenderTranslationKey, string>;
