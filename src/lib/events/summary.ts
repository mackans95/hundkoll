import * as locale from '$lib/locale';
import type { EventDetails } from '$lib/types/domain';

/**
 * Names a count of something, leaving the number off when there was only one.
 * Accepts the older rows that stored a plain boolean, reading true as one.
 * (3, "kiss") → "kiss ×3", (true, "kiss") → "kiss"
 */
function countText(value: unknown, word: string): string | null {
	if (value === true) {
		return word;
	}
	if (typeof value === 'number' && value > 0) {
		return value > 1 ? locale.activities.summary.repeated(word, value) : word;
	}
	return null;
}

/**
 * Sums up what an event's details say, short enough to sit under its label in
 * the recent-events list. Returns an empty string when there is nothing to
 * add beyond the activity itself.
 * ("walk", { duration_min: 35, pee: 3 }) → "35 min · kiss ×3"
 */
export function detailSummary(typeId: string, details: EventDetails): string {
	const parts: (string | null)[] = [];
	if (typeId === 'walk' || typeId === 'accident') {
		if (typeof details.duration_min === 'number') {
			parts.push(locale.units.minutes(String(details.duration_min)));
		}
		parts.push(
			countText(details.pee, locale.activities.summary.pee),
			countText(details.poop, locale.activities.summary.poop)
		);
	} else if (typeId === 'meal') {
		if (typeof details.portion_g === 'number') {
			parts.push(locale.units.grams(String(details.portion_g)));
		}
		if (details.finished === true) {
			parts.push(locale.activities.summary.finished);
		}
		if (details.finished === false) {
			parts.push(locale.activities.summary.notFinished);
		}
	} else if (typeId === 'weight') {
		if (typeof details.kg === 'number') {
			parts.push(locale.units.kilograms(String(details.kg).replace('.', ',')));
		}
	}
	return parts.filter(Boolean).join(locale.activities.summary.separator);
}
