// Per-type detail fields, shared by the dialog form (rendering) and the
// form action (parsing). Adding a field here is all it takes to collect it.
//
// 'count' renders as a checkbox that reveals a stepper when checked; it
// submits the checkbox under the field name plus the count under
// "<name>_count" (so a no-JS submission degrades to a count of 1).

export type DetailField = {
	name: string;
	label: string;
	input: 'number' | 'checkbox' | 'count';
	step?: string;
	required?: boolean;
};

export const DETAIL_FIELDS: Record<string, DetailField[]> = {
	walk: [
		{ name: 'duration_min', label: 'Längd (minuter)', input: 'number' },
		{ name: 'pee', label: 'Kiss', input: 'count' },
		{ name: 'poop', label: 'Bajs', input: 'count' }
	],
	accident: [
		{ name: 'pee', label: 'Kiss', input: 'count' },
		{ name: 'poop', label: 'Bajs', input: 'count' }
	],
	meal: [
		{ name: 'portion_g', label: 'Portion (gram)', input: 'number' },
		{ name: 'finished', label: 'Åt upp', input: 'checkbox' }
	],
	weight: [{ name: 'kg', label: 'Vikt (kg)', input: 'number', step: '0.1', required: true }]
};

/** "kiss", "kiss ×3" — accepts legacy boolean rows as a count of one. */
function countText(value: unknown, word: string): string | null {
	if (value === true) {
		return word;
	}
	if (typeof value === 'number' && value > 0) {
		return value > 1 ? `${word} ×${value}` : word;
	}
	return null;
}

/** Short Swedish summary of an event's details for the recent-events list. */
export function detailSummary(typeId: string, details: Record<string, unknown>): string {
	const parts: (string | null)[] = [];
	if (typeId === 'walk' || typeId === 'accident') {
		if (typeof details.duration_min === 'number') {
			parts.push(`${details.duration_min} min`);
		}
		parts.push(countText(details.pee, 'kiss'), countText(details.poop, 'bajs'));
	} else if (typeId === 'meal') {
		if (typeof details.portion_g === 'number') {
			parts.push(`${details.portion_g} g`);
		}
		if (details.finished === true) {
			parts.push('åt upp');
		}
		if (details.finished === false) {
			parts.push('åt inte upp');
		}
	} else if (typeId === 'weight') {
		if (typeof details.kg === 'number') {
			parts.push(`${String(details.kg).replace('.', ',')} kg`);
		}
	}
	return parts.filter(Boolean).join(' · ');
}
