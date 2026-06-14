// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { CastSenderTranslationKey } from './en';

export default {
	'plugin.cast-sender.casting.track': 'Diffusion de « {title} » par {artist}',
	'plugin.cast-sender.casting.album': 'Diffusion de l\'album « {album} »',
	'plugin.cast-sender.casting.queue': 'Diffusion de {count} pistes',
	'plugin.cast-sender.action.cast-album': 'Diffuser l\'album',
	'plugin.cast-sender.action.cast-queue': 'Diffuser la file d\'attente',
} satisfies Record<CastSenderTranslationKey, string>;
