import * as locale from '$lib/locale';
import { planTypeSettings } from '$lib/typeSettings';
import type { TypeSettingsRow } from '$lib/types/domain';
import type { Db } from './db';

const COLUMNS = 'type_id, chart_color, show_on_status';

/**
 * Every stored row, by type. RLS limits them to the household's own. Null
 * means the read failed; a type without a row simply has its defaults.
 */
export async function listTypeSettings(db: Db): Promise<Map<string, TypeSettingsRow> | null> {
	const { data, error } = await db.from('type_settings').select(COLUMNS);

	if (error) {
		console.error('type settings read failed:', error.code, error.message);
		return null;
	}

	return new Map((data ?? []).map((row) => [row.type_id, row]));
}

/**
 * Saves what the type page changed. Update, or insert the first time: an
 * upsert would also write the key columns, which the update grant leaves out.
 * Returns a Swedish error message, or null when it stuck.
 */
export async function saveTypeSettings(
	db: Db,
	typeId: string,
	form: FormData
): Promise<string | null> {
	const { data: row, error: readError } = await db
		.from('type_settings')
		.select(COLUMNS)
		.eq('type_id', typeId)
		.maybeSingle();

	if (readError) {
		console.error('type settings read failed:', readError.code, readError.message);
		return locale.errors.saveFailed;
	}

	const plan = planTypeSettings(typeId, row, form);
	if ('error' in plan) {
		return plan.error;
	}
	if (Object.keys(plan.patch).length === 0) {
		return null;
	}

	if (row) {
		const { error } = await db.from('type_settings').update(plan.patch).eq('type_id', typeId);
		if (error) {
			console.error('type settings update failed:', error.code, error.message);
			return locale.errors.saveFailed;
		}
		return null;
	}

	// The household is the dog's: one household, one dog, and RLS shows only hers.
	const { data: dog } = await db.from('dogs').select('household_id').limit(1).maybeSingle();
	if (!dog) {
		return locale.errors.noDog;
	}

	const { error } = await db
		.from('type_settings')
		.insert({ household_id: dog.household_id, type_id: typeId, ...plan.patch });
	if (error) {
		console.error('type settings insert failed:', error.code, error.message);
		return locale.errors.saveFailed;
	}
	return null;
}
