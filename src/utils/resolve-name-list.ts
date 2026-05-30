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
