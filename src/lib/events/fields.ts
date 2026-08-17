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
	// Portion size is always the same, so meals only track whether she
	// finished; legacy portion_g rows still render in summaries.
	meal: [{ name: 'finished', label: 'Åt upp', input: 'checkbox' }],
	weight: [{ name: 'kg', label: 'Vikt (kg)', input: 'number', step: '0.1', required: true }]
};

export function fieldsFor(typeId: string): DetailField[] {
	return DETAIL_FIELDS[typeId] ?? [];
}
