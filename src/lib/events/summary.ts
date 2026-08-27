import * as locale from '$lib/locale';
import { fieldsFor, LEGACY_SUMMARIES } from './fields';
import type { EventDetails } from '$lib/types/domain';

/** Anything that can name a stored value and say how it reads. */
type Summarizable = { name: string; summarize?: (value: unknown) => string | null };

/**
 * Sums up what an event's details say, short enough to sit under its label in
 * the recent-events list. Each field declares its own wording in
 * DETAIL_FIELDS, so no type is special-cased here. Returns an empty string
 * when there is nothing to add beyond the activity itself.
 * ("walk", { duration_min: 35, pee: 3 }) → "35 min · kiss ×3"
 */
export function detailSummary(typeId: string, details: EventDetails): string {
	return summarize([...(LEGACY_SUMMARIES[typeId] ?? []), ...fieldsFor(typeId)], details);
}

/**
 * The same, over a field list given directly — the counterpart to parseFields,
 * and for the same reason.
 *
 * A `reveal` needs no summarize of its own: it cannot be stored without one of
 * its causes, so the causes are always what there is to say. Wording it too
 * would read as "olycka · spydde", saying the same thing twice.
 */
export function summarize(fields: Summarizable[], details: EventDetails): string {
	return fields
		.map((field) => field.summarize?.(details[field.name]) ?? null)
		.filter(Boolean)
		.join(locale.activities.summary.separator);
}
