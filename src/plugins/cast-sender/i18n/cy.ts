// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { CastSenderTranslationKey } from './en';

export default {
	'plugin.cast-sender.casting.track': 'Yn castio "{title}" gan {artist}',
	'plugin.cast-sender.casting.album': 'Yn castio\'r albwm "{album}"',
	'plugin.cast-sender.casting.queue': 'Yn castio {count} trac',
	'plugin.cast-sender.action.cast-album': 'Castio albwm',
	'plugin.cast-sender.action.cast-queue': 'Castio\'r ciw',
} satisfies Record<CastSenderTranslationKey, string>;
