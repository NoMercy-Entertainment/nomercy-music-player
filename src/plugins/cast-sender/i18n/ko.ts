// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { CastSenderTranslationKey } from './en';

export default {
	'plugin.cast-sender.casting.track': '{artist}의 "{title}" 캐스트 중',
	'plugin.cast-sender.casting.album': '앨범 "{album}" 캐스트 중',
	'plugin.cast-sender.casting.queue': '{count}곡 캐스트 중',
	'plugin.cast-sender.action.cast-album': '앨범 캐스트',
	'plugin.cast-sender.action.cast-queue': '대기열 캐스트',
} satisfies Record<CastSenderTranslationKey, string>;
