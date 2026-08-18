import { careStatus } from '$lib/server/care';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals: { supabase } }) => {
	// The moment the page renders from, sent with the data so server render
	// and hydration agree on every relative time.
	return { ...(await careStatus(supabase)), now: new Date() };
};
