// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { CastSenderTranslationKey } from './en';

export default {
	'plugin.cast-sender.casting.track': 'Đang truyền "{title}" của {artist}',
	'plugin.cast-sender.casting.album': 'Đang truyền album "{album}"',
	'plugin.cast-sender.casting.queue': 'Đang truyền {count} bản nhạc',
	'plugin.cast-sender.action.cast-album': 'Truyền album',
	'plugin.cast-sender.action.cast-queue': 'Truyền hàng đợi',
} satisfies Record<CastSenderTranslationKey, string>;
