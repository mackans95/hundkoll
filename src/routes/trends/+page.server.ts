import { readsFailed } from '$lib/server/reads';
import { loadTrends, toPeriod } from '$lib/server/stats';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, setHeaders, locals: { supabase } }) => {
	const trends = await loadTrends(supabase, toPeriod(url.searchParams.get('period')));
	readsFailed(setHeaders, trends.failed ? null : trends);

	return trends;
};
