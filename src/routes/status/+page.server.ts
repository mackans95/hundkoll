import { careStatus } from '$lib/server/care';
import { currentAbsence } from '$lib/server/events';
import { readsFailed } from '$lib/server/reads';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ setHeaders, locals: { supabase } }) => {
	const [status, away] = await Promise.all([careStatus(supabase), currentAbsence(supabase)]);
	readsFailed(setHeaders, status, away);

	return {
		daily: status?.daily ?? [],
		timed: status?.timed ?? [],
		untimed: status?.untimed ?? [],
		// A dog with nothing tracked and an unreachable database look identical
		// otherwise, and the second must not be cached as the first.
		statusFailed: status === null,
		/** The open absence, if any: the banner, and what pauses the daily cards. */
		away: away?.event ?? null,
		// The moment the page renders from, sent with the data so server render
		// and hydration agree on every relative time.
		now: new Date()
	};
};
