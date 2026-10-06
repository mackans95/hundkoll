import * as locale from '$lib/locale';
import { DEFAULT_TRENDS, parseTrendRows, type TrendConfigRow } from '$lib/stats/trendConfig';
import type { Json } from '$lib/types/database';
import type { Db } from './db';

/**
 * The household's Trender list, or the defaults when it has never been
 * edited. Null means the read failed. Rows naming a type or field since
 * removed are dropped here, so every caller sees a list it can draw.
 */
export async function readTrendConfig(
	db: Db,
	knownTypes: ReadonlySet<string>
): Promise<TrendConfigRow[] | null> {
	const { data, error } = await db.from('trend_settings').select('rows').maybeSingle();

	if (error) {
		console.error('trend settings read failed:', error.code, error.message);
		return null;
	}

	return data ? parseTrendRows(data.rows, knownTypes) : DEFAULT_TRENDS;
}

/**
 * Stores the whole list. Update, or insert the first time: an upsert would
 * also write the key column, which the update grant leaves out.
 */
export async function saveTrendConfig(db: Db, rows: TrendConfigRow[]): Promise<string | null> {
	const value = rows as unknown as Json;
	const { data: updated, error } = await db
		.from('trend_settings')
		.update({ rows: value })
		.not('household_id', 'is', null)
		.select('household_id');

	if (error) {
		console.error('trend settings update failed:', error.code, error.message);
		return locale.errors.saveFailed;
	}
	if (updated.length > 0) {
		return null;
	}

	// The household is the dog's: one household, one dog, and RLS shows only hers.
	const { data: dog } = await db.from('dogs').select('household_id').limit(1).maybeSingle();
	if (!dog) {
		return locale.errors.noDog;
	}

	const { error: insertError } = await db
		.from('trend_settings')
		.insert({ household_id: dog.household_id, rows: value });
	if (insertError) {
		console.error('trend settings insert failed:', insertError.code, insertError.message);
		return locale.errors.saveFailed;
	}
	return null;
}
