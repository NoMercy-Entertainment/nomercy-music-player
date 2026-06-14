// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { CastSenderTranslationKey } from './en';

export default {
	'plugin.cast-sender.casting.track': 'กำลังแคสต์ "{title}" โดย {artist}',
	'plugin.cast-sender.casting.album': 'กำลังแคสต์อัลบั้ม "{album}"',
	'plugin.cast-sender.casting.queue': 'กำลังแคสต์ {count} แทร็ก',
	'plugin.cast-sender.action.cast-album': 'แคสต์อัลบั้ม',
	'plugin.cast-sender.action.cast-queue': 'แคสต์คิว',
} satisfies Record<CastSenderTranslationKey, string>;
