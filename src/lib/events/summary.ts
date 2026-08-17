import type { EventDetails } from '$lib/types/domain';

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
