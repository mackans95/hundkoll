import type { Session, User } from '@supabase/supabase-js';
import type { Db } from '$lib/server/db';
import type { SessionResult } from '$lib/server/auth';

// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
	namespace App {
		interface Locals {
			/** Request-scoped and typed against the generated schema. */
			supabase: Db;
			safeGetSession: () => Promise<SessionResult>;
			session: Session | null;
			user: User | null;
		}
		interface PageData {
			session: Session | null;
			user: User | null;
		}
	}
}

export {};
