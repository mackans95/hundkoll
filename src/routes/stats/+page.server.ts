import { loadStats } from '$lib/server/stats';
import type { Period } from '$lib/types/domain';
import type { PageServerLoad } from './$types';

/**
 * Reads a period out of a query string, falling back to the daily view when
 * the parameter is missing or is not one we recognise.
 * "week" → "week", "fortnight" → "day"
 */
function toPeriod(raw: string | null): Period {
	// A record: adding a Period without teaching this function is a compile error.
	const PERIODS: Record<Period, true> = { day: true, week: true, month: true };

	// hasOwn, not `in` — `in` walks the prototype chain, so ?period=toString
	// would pass for a period.
	return raw !== null && Object.hasOwn(PERIODS, raw) ? (raw as Period) : 'day';
}

export const load: PageServerLoad = async ({ url, locals: { supabase } }) => {
	// Both selections live in the URL, so a reload comes back to the same view.
	const period = toPeriod(url.searchParams.get('period'));
	const trend = toPeriod(url.searchParams.get('trend'));

	return loadStats(supabase, period, trend);
};
