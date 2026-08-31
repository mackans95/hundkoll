import { careStatus } from '$lib/server/care';
import { readsFailed } from '$lib/server/reads';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ setHeaders, locals: { supabase } }) => {
	const status = await careStatus(supabase);
	readsFailed(setHeaders, status);

	return {
		timed: status?.timed ?? [],
		untimed: status?.untimed ?? [],
		// A dog with nothing tracked and an unreachable database look identical
		// otherwise, and the second must not be cached as the first.
		statusFailed: status === null,
		// The moment the page renders from, sent with the data so server render
		// and hydration agree on every relative time.
		now: new Date()
	};
};
