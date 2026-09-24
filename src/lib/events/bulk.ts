// Several events posted as one form, from the Logga flera sheet on Historik.
// Each row's fields carry a prefix; stripped, a row is exactly what the single
// dialog posts, so the dialog's parser reads it and no second one exists.

import * as locale from '$lib/locale';
import type { EventType } from '$lib/types/domain';
import { parseDetails } from './details';
import { detailSummary } from './summary';

/** The field name for one row: (0, "pee") → "r0_pee". */
export function rowName(index: number, field: string): string {
	return `${rowPrefix(index)}${field}`;
}

export function rowPrefix(index: number): string {
	return `r${index}_`;
}

const ROW_KEY = /^r(\d+)_(.+)$/;

/** One row's fields, as a dialog would have posted them; `number` is 1-based, for messages. */
export type BulkRow = { number: number; form: FormData };

/** Groups prefixed fields by row index, prefix stripped. */
function groupRows(form: FormData): Map<number, FormData> {
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

	return rows;
}

/** One row's fields out of the whole form, prefix stripped — what the sheet folds from. */
export function rowFields(form: FormData, index: number): FormData {
	return groupRows(form).get(index) ?? new FormData();
}

/**
 * The line a folded row shows: what it is, when, and what its details say, in
 * the same words the events list uses. A row with no time says so, since the
 * server will skip it.
 * (walk, { time: "11:20", duration_min: "10", pee: "1" }) → "🚶 Promenad · 11:20 · 10 min · kiss"
 */
export function foldedText(
	type: Pick<EventType, 'id' | 'label' | 'icon'>,
	fields: FormData
): string {
	const time = String(fields.get('time') ?? '').trim();
	const parsed = parseDetails(fields, type.id);
	return [
		[type.icon, type.label].filter(Boolean).join(' '),
		time || locale.history.bulk.noTime,
		parsed.ok ? detailSummary(type.id, parsed.details) : ''
	]
		.filter(Boolean)
		.join(locale.activities.summary.separator);
}

/**
 * Splits the posted form into one form per row, in row order, with the prefix
 * gone and `occurred_at` composed from the day and the row's clock time. A row
 * with no time is not a row — a Ny rad added and never filled in — and is
 * skipped without looking at anything else in it.
 * ("2026-08-14", { r0_type_id: walk, r0_time: "07:30", r0_pee: "1", r1_type_id: meal })
 *   → [{ number: 1, form: { type_id: walk, occurred_at: "2026-08-14T07:30", pee: "1", detailed: "1" } }]
 */
export function splitRows(form: FormData, day: string): BulkRow[] {
	return [...groupRows(form).entries()]
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
