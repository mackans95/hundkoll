import type { Db } from './db';

/**
 * The signed-in user's id, verified, or null. getClaims checks the token's
 * signature against the project's published keys, cached across requests, so
 * a warm instance asks Auth for nothing. A revoked session therefore lasts
 * until its token expires (at most an hour). An expired token is still
 * refreshed from the cookie first.
 */
export async function verifiedUserId(db: Db): Promise<string | null> {
	const { data, error } = await db.auth.getClaims();
	return error || !data ? null : data.claims.sub;
}
