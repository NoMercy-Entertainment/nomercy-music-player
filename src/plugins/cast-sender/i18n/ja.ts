// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { CastSenderTranslationKey } from './en';

export default {
	'plugin.cast-sender.casting.track': '{artist} の「{title}」をキャスト中',
	'plugin.cast-sender.casting.album': 'アルバム「{album}」をキャスト中',
	'plugin.cast-sender.casting.queue': '{count} 曲をキャスト中',
	'plugin.cast-sender.action.cast-album': 'アルバムをキャスト',
	'plugin.cast-sender.action.cast-queue': 'キューをキャスト',
} satisfies Record<CastSenderTranslationKey, string>;
