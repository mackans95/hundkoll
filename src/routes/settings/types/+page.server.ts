import { listEventTypes } from '$lib/server/care';
import { readsFailed } from '$lib/server/reads';
import { listTypeSettings } from '$lib/server/typeSettings';
import { typeSettings } from '$lib/typeSettings';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ setHeaders, locals: { supabase } }) => {
	const [types, settings] = await Promise.all([
		listEventTypes(supabase),
		listTypeSettings(supabase)
	]);
	readsFailed(setHeaders, types, settings);

	return {
		types: (types ?? []).map((type) => ({
			...type,
			settings: typeSettings(type.id, settings?.get(type.id))
		})),
		failed: types === null || settings === null
	};
};
