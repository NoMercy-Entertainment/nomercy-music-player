// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * Reduce an `Array<{name:string}>` or plain string down to a single
 * comma-joined display string. Returns `''` for absent or empty input.
 */
export function resolveNameList(field: Array<{ name: string }> | string | undefined): string {
	if (!field)
		return '';
	if (typeof field === 'string')
		return field;
	return field.map(entry => entry?.name).filter(Boolean)
		.join(', ');
}
