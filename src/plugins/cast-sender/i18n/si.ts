// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { CastSenderTranslationKey } from './en';

export default {
	'plugin.cast-sender.casting.track': '{artist} විසින් "{title}" කාස්ට් කරමින්',
	'plugin.cast-sender.casting.album': '"{album}" ඇල්බමය කාස්ට් කරමින්',
	'plugin.cast-sender.casting.queue': '{count} ගී කාස්ට් කරමින්',
	'plugin.cast-sender.action.cast-album': 'ඇල්බමය කාස්ට් කරන්න',
	'plugin.cast-sender.action.cast-queue': 'පෝලිම කාස්ට් කරන්න',
} satisfies Record<CastSenderTranslationKey, string>;
