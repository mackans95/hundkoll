// Several events posted as one form, from the Logga flera sheet on Historik.
// Each row's fields carry a prefix; stripped, a row is exactly what the single
// dialog posts, so the dialog's parser reads it and no second one exists.

/** The field name for one row: ("r0_", "pee") → "r0_pee". */
export function rowName(index: number, field: string): string {
	return `${rowPrefix(index)}${field}`;
}

export function rowPrefix(index: number): string {
	return `r${index}_`;
}

const ROW_KEY = /^r(\d+)_(.+)$/;

/** One row's fields, as a dialog would have posted them; `number` is 1-based, for messages. */
export type BulkRow = { number: number; form: FormData };

/**
 * Splits the posted form into one form per row, in row order, with the prefix
 * gone and `occurred_at` composed from the day and the row's clock time. A row
 * with no time is not a row: the starting slots are like lines on the paper,
 * and an unused one is skipped without looking at anything else in it.
 * ("2026-08-14", { r0_type_id: walk, r0_time: "07:30", r0_pee: "1", r1_type_id: meal })
 *   → [{ number: 1, form: { type_id: walk, occurred_at: "2026-08-14T07:30", pee: "1", detailed: "1" } }]
 */
export function splitRows(form: FormData, day: string): BulkRow[] {
	const rows = new Map<number, FormData>();

	for (const [key, value] of form.entries()) {
		const match = ROW_KEY.exec(key);
		if (!match || typeof value !== 'string') {
			continue;
		}
		const index = Number(match[1]);
		const row = rows.get(index) ?? new FormData();
		row.append(match[2], value);
		rows.set(index, row);
	}

	return [...rows.entries()]
		.sort(([a], [b]) => a - b)
		.filter(([, row]) => String(row.get('time') ?? '').trim() !== '')
		.map(([index, row]) => {
			row.set('occurred_at', `${day}T${String(row.get('time')).trim()}`);
			// The row rendered every field the dialog would, so the checkboxes
			// are trustworthy — which is what this flag tells the parser.
			row.set('detailed', '1');
			return { number: index + 1, form: row };
		});
}
