import type { Stamp } from '$lib/offline/pageCache';
import * as time from '$lib/time';
import type { Db } from './db';

/**
 * Where the household's data is now (plan 31b), or null when the read failed.
 * No row yet means nothing was written since the version began: 0.
 */
export async function currentStamp(db: Db): Promise<Stamp | null> {
	const { data, error } = await db.from('data_versions').select('version').maybeSingle();
	if (error) {
		console.error('data version read failed:', error.code, error.message);
		return null;
	}
	return { version: data?.version ?? 0, day: time.stockholmDay(new Date()) };
}
