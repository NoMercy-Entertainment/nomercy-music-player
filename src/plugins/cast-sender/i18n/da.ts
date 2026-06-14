// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { CastSenderTranslationKey } from './en';

export default {
	'plugin.cast-sender.casting.track': 'Caster "{title}" af {artist}',
	'plugin.cast-sender.casting.album': 'Caster album "{album}"',
	'plugin.cast-sender.casting.queue': 'Caster {count} numre',
	'plugin.cast-sender.action.cast-album': 'Cast album',
	'plugin.cast-sender.action.cast-queue': 'Cast kø',
} satisfies Record<CastSenderTranslationKey, string>;
