// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { CastSenderTranslationKey } from './en';

export default {
	'plugin.cast-sender.casting.track': 'Isakaza i-"{title}" ka-{artist}',
	'plugin.cast-sender.casting.album': 'Isakaza i-albhamu "{album}"',
	'plugin.cast-sender.casting.queue': 'Isakaza amathrekhi angu-{count}',
	'plugin.cast-sender.action.cast-album': 'Sakaza i-albhamu',
	'plugin.cast-sender.action.cast-queue': 'Sakaza ulayini',
} satisfies Record<CastSenderTranslationKey, string>;
