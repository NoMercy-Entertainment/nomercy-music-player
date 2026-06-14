// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { CastSenderTranslationKey } from './en';

export default {
	'plugin.cast-sender.casting.track': 'Difusion de « {title} » per {artist}',
	'plugin.cast-sender.casting.album': 'Difusion de l\'album « {album} »',
	'plugin.cast-sender.casting.queue': 'Difusion de {count} pistas',
	'plugin.cast-sender.action.cast-album': 'Difusar l\'album',
	'plugin.cast-sender.action.cast-queue': 'Difusar la coa',
} satisfies Record<CastSenderTranslationKey, string>;
