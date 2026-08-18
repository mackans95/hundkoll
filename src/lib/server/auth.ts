import type { Session, User } from '@supabase/supabase-js';
import type { Db } from './db';

export type SessionResult = { session: Session | null; user: User | null };

/**
 * Reads the session and verifies its user against the Auth server. getSession
 * only reads the cookie without checking it is genuine — hence Supabase's
 * "could be insecure" warning — so the session is rebuilt around getUser().
 */
export async function safeGetSession(db: Db): Promise<SessionResult> {
	const {
		data: { session }
	} = await db.auth.getSession();
	if (!session) {
		return { session: null, user: null };
	}

	const {
		data: { user },
		error
	} = await db.auth.getUser();
	if (error || !user) {
		return { session: null, user: null };
	}

	const { access_token, refresh_token, expires_at, expires_in, token_type } = session;
	return {
		session: { access_token, refresh_token, expires_at, expires_in, token_type, user },
		user
	};
}
