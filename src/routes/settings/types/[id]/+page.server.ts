import { error, fail, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import * as locale from '$lib/locale';
import { listEventTypes, saveInterval } from '$lib/server/care';
import { readsFailed } from '$lib/server/reads';
import { listTypeSettings, saveTypeSettings } from '$lib/server/typeSettings';
import { CHARTED_TYPES, paletteFor } from '$lib/stats/palette';
import { typeSettings } from '$lib/typeSettings';
import { readTrendConfig, saveTrendConfig } from '$lib/server/trendSettings';
import { sameTrends, setTypeTrends, trendKey, trendLabel, trendsFor } from '$lib/stats/trendConfig';
import type { Db } from '$lib/server/db';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, url, setHeaders, locals: { supabase } }) => {
	const [types, settings] = await Promise.all([
		listEventTypes(supabase),
		listTypeSettings(supabase)
	]);
	const trends = types ? await readTrendConfig(supabase, new Set(types.map((t) => t.id))) : null;
	readsFailed(setHeaders, types, settings, trends);

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
		trends: trendsFor(params.id).map((row) => ({
			key: trendKey(row),
			label: trendLabel(row, type),
			on: (trends ?? []).some((listed) => trendKey(listed) === trendKey(row))
		})),
		// A form over defaults it could not read would save over the real choice.
		failed: types === null || settings === null || trends === null,
		saved: url.searchParams.has('saved')
	};
};

/** The page's Trender switches, applied to the household's list if they changed it. */
async function saveTypeTrends(db: Db, typeId: string, form: FormData): Promise<string | null> {
	if (!form.has('trends_present')) {
		return null;
	}
	const types = await listEventTypes(db);
	const before = types ? await readTrendConfig(db, new Set(types.map((t) => t.id))) : null;
	if (!before) {
		return locale.errors.saveFailed;
	}
	const after = setTypeTrends(before, typeId, form.getAll('trend').map(String));
	return sameTrends(before, after) ? null : saveTrendConfig(db, after);
}

export const actions: Actions = {
	save: async ({ params, request, locals: { supabase } }) => {
		const form = await request.formData();
		const message =
			(await saveInterval(supabase, params.id, form)) ??
			(await saveTypeSettings(supabase, params.id, form)) ??
			(await saveTypeTrends(supabase, params.id, form));
		if (message) {
			return fail(400, { message });
		}
		redirect(303, resolve('/settings/types/[id]', { id: params.id }) + '?saved');
	}
};
