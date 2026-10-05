import { error, fail, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import * as locale from '$lib/locale';
import { listEventTypes, saveInterval } from '$lib/server/care';
import { readsFailed } from '$lib/server/reads';
import { listTypeSettings, saveTypeSettings } from '$lib/server/typeSettings';
import { CHARTED_TYPES, paletteFor } from '$lib/stats/palette';
import { typeSettings } from '$lib/typeSettings';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, url, setHeaders, locals: { supabase } }) => {
	const [types, settings] = await Promise.all([
		listEventTypes(supabase),
		listTypeSettings(supabase)
	]);
	readsFailed(setHeaders, types, settings);

	const type = types?.find((candidate) => candidate.id === params.id);
	if (types && !type) {
		error(404, locale.errors.unknownType);
	}

	return {
		// Null only when the catalogue read failed; the page says so instead of a form.
		type: type ?? null,
		settings: typeSettings(params.id, settings?.get(params.id)),
		palette: params.id in CHARTED_TYPES ? paletteFor(params.id) : [],
		// The absence type is the banner on Status, never a card, so there is nothing to hide.
		statusOption: type?.category !== 'absence',
		// A form over defaults it could not read would save over the real choice.
		failed: types === null || settings === null,
		saved: url.searchParams.has('saved')
	};
};

export const actions: Actions = {
	save: async ({ params, request, locals: { supabase } }) => {
		const form = await request.formData();
		const message =
			(await saveInterval(supabase, params.id, form)) ??
			(await saveTypeSettings(supabase, params.id, form));
		if (message) {
			return fail(400, { message });
		}
		redirect(303, resolve('/settings/types/[id]', { id: params.id }) + '?saved');
	}
};
