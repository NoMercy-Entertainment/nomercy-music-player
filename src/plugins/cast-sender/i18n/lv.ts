// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { CastSenderTranslationKey } from './en';

export default {
	'plugin.cast-sender.casting.track': 'Tiek pārraidīts "{title}", izpildītājs {artist}',
	'plugin.cast-sender.casting.album': 'Tiek pārraidīts albums "{album}"',
	'plugin.cast-sender.casting.queue': 'Tiek pārraidīti {count} ieraksti',
	'plugin.cast-sender.action.cast-album': 'Pārraidīt albumu',
	'plugin.cast-sender.action.cast-queue': 'Pārraidīt rindu',
} satisfies Record<CastSenderTranslationKey, string>;
