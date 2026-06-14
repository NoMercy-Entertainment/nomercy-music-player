// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { BasePlaylistItem } from '@nomercy-entertainment/nomercy-player-core';
import type { MusicPlayerConfig, MusicPlaylistItem } from '../types';
import { applyKitV1Compat } from '@nomercy-entertainment/nomercy-player-core/compat';

/**
 * Normalise a v1 music player config to the v2 `MusicPlayerConfig` shape.
 *
 * Applies the kit-level normalizer (`accessToken` → `auth.bearerToken`,
 * `debug: true` → `logLevel: 'debug'`) and returns a clean config with the
 * deprecated fields stripped. Called at the library boundary inside the
 * `nmMPlayer` / `nmMusicPlayer` factory `setup()` wrapper so that core never
 * sees v1-era fields.
 *
 * Safe to call on a config that is already v2-clean — all mappings are
 * additive and conditional (existing v2 values always win).
 */
export function normalizeMusicConfig<T extends BasePlaylistItem = MusicPlaylistItem>(
	config: MusicPlayerConfig<T> & { accessToken?: string | (() => string); debug?: boolean },
): MusicPlayerConfig<T> {
	return applyKitV1Compat(config) as MusicPlayerConfig<T>;
}
