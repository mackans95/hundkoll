import * as locale from '$lib/locale';
import { fieldsFor, LEGACY_SUMMARIES } from './fields';
import type { EventDetails } from '$lib/types/domain';

/**
 * Sums up what an event's details say, short enough to sit under its label in
 * the recent-events list. Each field declares its own wording in
 * DETAIL_FIELDS, so no type is special-cased here. Returns an empty string
 * when there is nothing to add beyond the activity itself.
 * ("walk", { duration_min: 35, pee: 3 }) → "35 min · kiss ×3"
 */
export function detailSummary(typeId: string, details: EventDetails): string {
	return [...(LEGACY_SUMMARIES[typeId] ?? []), ...fieldsFor(typeId)]
		.map((field) => field.summarize?.(details[field.name]) ?? null)
		.filter(Boolean)
		.join(locale.activities.summary.separator);
}
