// Which Statistik cards show, in which order (plan 28): an ordered list of
// { type, shown }, stored per household as jsonb in stats_settings. A card is
// its type's, and CHARTED_TYPES is the list of cards that exist.

import { CHARTED_TYPES } from './palette';

export type CardRow = { type: string; shown: boolean };

/** The order Statistik had before it was configurable. */
const FIRST_CARDS = ['walk', 'meal', 'accident', 'weight', 'alone', 'car_ride'];

/** Every card, all shown: today's six in today's order, any generated since after them. */
export function defaultCards(): CardRow[] {
	const types = Object.keys(CHARTED_TYPES);
	return [
		...FIRST_CARDS.filter((type) => type in CHARTED_TYPES),
		...types.filter((type) => !FIRST_CARDS.includes(type))
	].map((type) => ({ type, shown: true }));
}

/**
 * Reads a stored list back against the cards that exist: a type that has no
 * card any more is dropped, and a card the list doesn't name yet, such as one
 * `npm run new-event` just generated, joins the end, shown.
 */
export function parseCards(raw: unknown): CardRow[] {
	const rows: CardRow[] = [];
	for (const item of Array.isArray(raw) ? raw : []) {
		if (typeof item !== 'object' || item === null) continue;
		const { type, shown } = item as Record<string, unknown>;
		if (typeof type !== 'string' || !(type in CHARTED_TYPES)) continue;
		if (rows.some((row) => row.type === type)) continue;
		rows.push({ type, shown: shown !== false });
	}
	const missing = defaultCards().filter((card) => !rows.some((row) => row.type === card.type));
	return [...rows, ...missing];
}

/**
 * The list in the order the Tabeller form posted it, each row shown when its
 * box was ticked, then the one move its button asked for. On the page the
 * moves happen on screen and arrive only with Spara; without JS each ▲ ▼
 * posts the list with its own move.
 */
export function planCardList(form: FormData): CardRow[] {
	const shown = new Set(form.getAll('shown').map(String));
	const rows = parseCards(
		form.getAll('card').map((type) => ({ type: String(type), shown: shown.has(String(type)) }))
	);

	const [op, at] = String(form.get('op') ?? '').split(':');
	const i = Number(at);
	if ((op === 'up' || op === 'down') && rows[i]) {
		const j = op === 'up' ? i - 1 : i + 1;
		if (rows[j]) [rows[i], rows[j]] = [rows[j], rows[i]];
	}
	return rows;
}

/** One card switched on or off from its type's page, the order untouched. */
export function setCardShown(current: CardRow[], type: string, shown: boolean): CardRow[] {
	return current.map((row) => (row.type === type ? { ...row, shown } : row));
}

/** Whether two lists say the same thing, so an untouched form writes nothing. */
export function sameCards(a: CardRow[], b: CardRow[]): boolean {
	return JSON.stringify(a) === JSON.stringify(b);
}
