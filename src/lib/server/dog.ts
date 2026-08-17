import type { Db } from './db';

export type Dog = { id: string; name: string };

/**
 * The dog. One household, one dog — RLS already limits the table to rows
 * this user may see, so "the first row" is "hers".
 */
export async function currentDog(db: Db): Promise<Dog | null> {
	const { data } = await db.from('dogs').select('id, name').limit(1).maybeSingle();
	return data;
}
