// Per-type detail fields, shared by the dialog form (rendering) and the
// form action (parsing). Adding a field here is all it takes to collect it.

export type DetailField = {
	name: string;
	label: string;
	input: 'number' | 'checkbox';
	step?: string;
	required?: boolean;
};

export const DETAIL_FIELDS: Record<string, DetailField[]> = {
	walk: [
		{ name: 'duration_min', label: 'Längd (minuter)', input: 'number' },
		{ name: 'pee', label: 'Kiss', input: 'checkbox' },
		{ name: 'poop', label: 'Bajs', input: 'checkbox' }
	],
	meal: [
		{ name: 'portion_g', label: 'Portion (gram)', input: 'number' },
		{ name: 'finished', label: 'Åt upp', input: 'checkbox' }
	],
	weight: [{ name: 'kg', label: 'Vikt (kg)', input: 'number', step: '0.1', required: true }]
};

// Types where a bare "logged now" row is meaningless — the primary button
// opens the detail dialog instead of quick-logging.
export const DETAIL_REQUIRED = new Set(['weight']);

/** Short Swedish summary of an event's details for the recent-events list. */
export function detailSummary(typeId: string, details: Record<string, unknown>): string {
	const parts: string[] = [];
	if (typeId === 'walk') {
		if (typeof details.duration_min === 'number') parts.push(`${details.duration_min} min`);
		if (details.pee === true) parts.push('kiss');
		if (details.poop === true) parts.push('bajs');
	} else if (typeId === 'meal') {
		if (typeof details.portion_g === 'number') parts.push(`${details.portion_g} g`);
		if (details.finished === true) parts.push('åt upp');
		if (details.finished === false) parts.push('åt inte upp');
	} else if (typeId === 'weight') {
		if (typeof details.kg === 'number') parts.push(`${String(details.kg).replace('.', ',')} kg`);
	}
	return parts.join(' · ');
}
