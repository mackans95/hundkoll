import { DEFAULT_TRENDS, parseTrendRows, type TrendConfigRow } from '$lib/stats/trendConfig';
import type { Json } from '$lib/types/database';
import type { Db } from './db';
import { readHouseholdJson, saveHouseholdJson } from './householdSettings';

/**
 * The household's Trender list, or the defaults when it has never been
 * edited. Null means the read failed. Rows naming a type or field since
 * removed are dropped here, so every caller sees a list it can draw.
 */
export async function readTrendConfig(
	db: Db,
	knownTypes: ReadonlySet<string>
): Promise<TrendConfigRow[] | null> {
	const stored = await readHouseholdJson(db, 'trend_settings', 'rows');
	if (stored === undefined) return null;
	return stored === null ? DEFAULT_TRENDS : parseTrendRows(stored, knownTypes);
}

/** Stores the whole list. */
export function saveTrendConfig(db: Db, rows: TrendConfigRow[]): Promise<string | null> {
	return saveHouseholdJson(db, 'trend_settings', 'rows', rows as unknown as Json);
}
