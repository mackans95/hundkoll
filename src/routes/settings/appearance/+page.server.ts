import { fail } from '@sveltejs/kit';
import * as locale from '$lib/locale';
import { listEventTypes } from '$lib/server/care';
import { readsFailed } from '$lib/server/reads';
import { listTypeSettings, saveTypeSettings } from '$lib/server/typeSettings';
import { chartPaired } from '$lib/stats/cardSpec';
import { CHARTED_TYPES, paletteFor } from '$lib/stats/palette';
import { typeSettings } from '$lib/typeSettings';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ setHeaders, locals: { supabase } }) => {
	const [types, settings] = await Promise.all([
		listEventTypes(supabase),
		listTypeSettings(supabase)
	]);
	readsFailed(setHeaders, types, settings);

	return {
		// In the catalogue's order, as on the type list.
		colors: (types ?? [])
			.filter((type) => type.id in CHARTED_TYPES)
			.map((type) => {
				const current = typeSettings(type.id, settings?.get(type.id));
				return {
					id: type.id,
					icon: type.icon,
					label: type.label,
					current: current.chartColor,
					// A split chart draws a second series, which the neutral can't stand beside.
					palette: paletteFor(current.chart !== null && chartPaired(current.chart))
				};
			}),
		// A form over defaults it could not read would save over the real choice.
		failed: types === null || settings === null
	};
};

export const actions: Actions = {
	save: async ({ request, locals: { supabase } }) => {
		const form = await request.formData();
		for (const typeId of Object.keys(CHARTED_TYPES)) {
			const color = form.get(`chart_color:${typeId}`);
			if (color === null) continue;
			// Each type through its own page's save, which writes only a change.
			const one = new FormData();
			one.set('chart_color', color);
			const message = await saveTypeSettings(supabase, typeId, one);
			if (message) {
				return fail(400, { message });
			}
		}
		return { saved: true };
	}
};
