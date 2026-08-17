import type { Db } from './db';

export type Dog = { id: string; name: string };

/**
 * Finds the dog this user keeps. One household, one dog, and RLS already
 * limits the table to rows they may see — so the first row is hers.
 */
export async function currentDog(db: Db): Promise<Dog | null> {
	const { data } = await db.from('dogs').select('id, name').limit(1).maybeSingle();
	return data;
}
