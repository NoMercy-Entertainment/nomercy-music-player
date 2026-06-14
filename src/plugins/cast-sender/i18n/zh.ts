// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { CastSenderTranslationKey } from './en';

export default {
	'plugin.cast-sender.casting.track': '正在投放 {artist} 的“{title}”',
	'plugin.cast-sender.casting.album': '正在投放专辑“{album}”',
	'plugin.cast-sender.casting.queue': '正在投放 {count} 首曲目',
	'plugin.cast-sender.action.cast-album': '投放专辑',
	'plugin.cast-sender.action.cast-queue': '投放队列',
} satisfies Record<CastSenderTranslationKey, string>;
