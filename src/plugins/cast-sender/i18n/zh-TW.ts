// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { CastSenderTranslationKey } from './en';

export default {
	'plugin.cast-sender.casting.track': '正在投放 {artist} 的「{title}」',
	'plugin.cast-sender.casting.album': '正在投放專輯「{album}」',
	'plugin.cast-sender.casting.queue': '正在投放 {count} 首曲目',
	'plugin.cast-sender.action.cast-album': '投放專輯',
	'plugin.cast-sender.action.cast-queue': '投放佇列',
} satisfies Record<CastSenderTranslationKey, string>;
