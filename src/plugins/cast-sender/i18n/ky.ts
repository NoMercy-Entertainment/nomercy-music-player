// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { CastSenderTranslationKey } from './en';

export default {
	'plugin.cast-sender.casting.track': '{artist} аткаруусундагы «{title}» таратылууда',
	'plugin.cast-sender.casting.album': '«{album}» альбому таратылууда',
	'plugin.cast-sender.casting.queue': '{count} трек таратылууда',
	'plugin.cast-sender.action.cast-album': 'Альбомду таратуу',
	'plugin.cast-sender.action.cast-queue': 'Кезекти таратуу',
} satisfies Record<CastSenderTranslationKey, string>;
