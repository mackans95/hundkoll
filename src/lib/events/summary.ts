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
		return value > 1 ? `${word} ×${value}` : word;
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
