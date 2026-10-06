import * as locale from '$lib/locale';
import type { Json } from '$lib/types/database';
import type { Db } from './db';

/** The one-row-per-household settings tables, and the jsonb column each holds. */
type HouseholdTable = { trend_settings: 'rows'; stats_settings: 'cards' };

/**
 * The household's stored value, null when it has never been saved, or
 * undefined when the read failed.
 */
export async function readHouseholdJson<T extends keyof HouseholdTable>(
	db: Db,
	table: T,
	column: HouseholdTable[T]
): Promise<Json | null | undefined> {
	const { data, error } = await db.from(table).select(column).maybeSingle();
	if (error) {
		console.error(`${table} read failed:`, error.code, error.message);
		return undefined;
	}
	return data ? ((data as Record<string, Json>)[column] ?? null) : null;
}

/**
 * Stores the household's value. Update, or insert the first time: an upsert
 * would also write the key column, which the update grant leaves out.
 * Returns a Swedish error message, or null when it stuck.
 */
export async function saveHouseholdJson<T extends keyof HouseholdTable>(
	db: Db,
	table: T,
	column: HouseholdTable[T],
	value: Json
): Promise<string | null> {
	// The two tables share this shape; the client's types can't follow a union
	// of table names, so the builder is typed as one of them.
	const settings = () => db.from(table as 'trend_settings');
	const field = column as 'rows';

	const { data: updated, error } = await settings()
		.update({ [field]: value })
		.not('household_id', 'is', null)
		.select('household_id');
	if (error) {
		console.error(`${table} update failed:`, error.code, error.message);
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

	const { error: insertError } = await settings().insert({
		household_id: dog.household_id,
		[field]: value
	});
	if (insertError) {
		console.error(`${table} insert failed:`, insertError.code, insertError.message);
		return locale.errors.saveFailed;
	}
	return null;
}
