import { careStatus } from '$lib/server/care';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals: { supabase } }) => {
	return careStatus(supabase);
};
