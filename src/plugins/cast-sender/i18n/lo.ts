// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { CastSenderTranslationKey } from './en';

export default {
	'plugin.cast-sender.casting.track': 'ກຳລັງສົ່ງ "{title}" ໂດຍ {artist}',
	'plugin.cast-sender.casting.album': 'ກຳລັງສົ່ງອັລບັ້ມ "{album}"',
	'plugin.cast-sender.casting.queue': 'ກຳລັງສົ່ງ {count} ເພງ',
	'plugin.cast-sender.action.cast-album': 'ສົ່ງອັລບັ້ມ',
	'plugin.cast-sender.action.cast-queue': 'ສົ່ງຄິວ',
} satisfies Record<CastSenderTranslationKey, string>;
