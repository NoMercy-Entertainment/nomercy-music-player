// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { CastSenderTranslationKey } from './en';

export default {
	'plugin.cast-sender.casting.track': '{artist} இன் "{title}" காஸ்ட் செய்யப்படுகிறது',
	'plugin.cast-sender.casting.album': '"{album}" ஆல்பம் காஸ்ட் செய்யப்படுகிறது',
	'plugin.cast-sender.casting.queue': '{count} டிராக்குகள் காஸ்ட் செய்யப்படுகின்றன',
	'plugin.cast-sender.action.cast-album': 'ஆல்பத்தை காஸ்ட் செய்',
	'plugin.cast-sender.action.cast-queue': 'வரிசையை காஸ்ட் செய்',
} satisfies Record<CastSenderTranslationKey, string>;
