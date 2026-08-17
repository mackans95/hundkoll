import type { Session, User } from '@supabase/supabase-js';
import type { Db } from './db';

export type SessionResult = { session: Session | null; user: User | null };

/**
 * Reads the session and verifies its user against the Auth server, returning
 * nothing at all if either step fails.
 *
 * getSession() only reads the cookie; it never checks that the cookie is
 * genuine. Reading `session.user` from that result — even implicitly, when
 * SvelteKit serializes page data — is what triggers Supabase's "could be
 * insecure" warning. So the session is rebuilt around a getUser() result.
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
