import type { Db } from '$lib/server/db';
import type { Period } from '$lib/types/domain';

// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
	namespace App {
		interface Locals {
			/** Request-scoped and typed against the generated schema. */
			supabase: Db;
			/** Verified by the hook; null when signed out. */
			userId: string | null;
		}
		interface PageState {
			/** The ☰ menu is open: a shallow history entry, so Back closes it. */
			menuOpen?: boolean;
			/** Statistik's tab, switched in place: every period is already loaded. */
			period?: Period;
		}
		interface PageData {
			signedIn: boolean;
		}
	}
}

export {};
