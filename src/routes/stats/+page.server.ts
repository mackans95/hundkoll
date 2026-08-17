import { loadStats } from '$lib/server/stats';
import { toPeriod } from '$lib/types/domain';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, locals: { supabase } }) => {
	// Both selections live in the URL, so a reload — or a tab switch and back
	// — comes back to the same view.
	const period = toPeriod(url.searchParams.get('period'));
	const trend = toPeriod(url.searchParams.get('trend'));

	return loadStats(supabase, period, trend);
};
