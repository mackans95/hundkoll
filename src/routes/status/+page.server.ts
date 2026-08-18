import { careStatus } from '$lib/server/care';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals: { supabase } }) => {
	// The moment the page renders from. Sent with the data so server render
	// and hydration agree, instead of each taking `new Date()` for itself and
	// repainting every relative time by the difference.
	return { ...(await careStatus(supabase)), now: new Date() };
};
