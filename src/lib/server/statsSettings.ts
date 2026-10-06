import { defaultCards, parseCards, type CardRow } from '$lib/stats/cardConfig';
import type { Json } from '$lib/types/database';
import type { Db } from './db';
import { readHouseholdJson, saveHouseholdJson } from './householdSettings';

/** The household's Statistik cards in order, or every card when never edited. Null: the read failed. */
export async function readCardConfig(db: Db): Promise<CardRow[] | null> {
	const stored = await readHouseholdJson(db, 'stats_settings', 'cards');
	if (stored === undefined) return null;
	return stored === null ? defaultCards() : parseCards(stored);
}

/** Stores the whole list. */
export function saveCardConfig(db: Db, cards: CardRow[]): Promise<string | null> {
	return saveHouseholdJson(db, 'stats_settings', 'cards', cards as unknown as Json);
}
