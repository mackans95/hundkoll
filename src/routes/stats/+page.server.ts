import { readsFailed } from '$lib/server/reads';
import { loadStats, toPeriod } from '$lib/server/stats';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, setHeaders, locals: { supabase } }) => {
	// The selection lives in the URL, so a reload comes back to the same view.
	const stats = await loadStats(supabase, toPeriod(url.searchParams.get('period')));
	// The guard reads nulls; loadStats has many reads and reports them as one.
	readsFailed(setHeaders, stats.failed ? null : stats);

	return stats;
};
