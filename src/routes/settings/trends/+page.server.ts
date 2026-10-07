import { fail } from '@sveltejs/kit';
import * as locale from '$lib/locale';
import { listEventTypes } from '$lib/server/care';
import type { Db } from '$lib/server/db';
import { readsFailed } from '$lib/server/reads';
import { readTrendConfig, saveTrendConfig } from '$lib/server/trendSettings';
import {
	childRow,
	planTrendList,
	sameTrends,
	trendChildren,
	trendKey,
	trendLabel,
	trendMetricLabel,
	trendsFor,
	type TrendConfigRow
} from '$lib/stats/trendConfig';
import type { Actions, PageServerLoad } from './$types';

/** The catalogue and the list it validates, read together for load and action alike. */
async function current(db: Db) {
	const types = await listEventTypes(db);
	const rows = types ? await readTrendConfig(db, new Set(types.map((type) => type.id))) : null;
	return { types, rows };
}

/** What a row's field reveals, each a checkbox under it, ticked when the row compares it. */
function childOptions(row: TrendConfigRow) {
	return trendChildren(row).map((field) => ({
		name: field.name,
		label: trendMetricLabel(childRow(row, field.name)),
		on: row.children?.includes(field.name) ?? false
	}));
}

export const load: PageServerLoad = async ({ setHeaders, locals: { supabase } }) => {
	const { types, rows } = await current(supabase);
	readsFailed(setHeaders, types, rows);

	const byId = new Map((types ?? []).map((type) => [type.id, type]));

	return {
		rows: (rows ?? []).map((row) => ({
			key: trendKey(row),
			label: trendLabel(row, byId.get(row.type)),
			better: row.better ?? '',
			children: childOptions(row)
		})),
		// Every metric, grouped by type; the page hides the ones already listed,
		// so a row removed before saving is offered again straight away.
		options: (types ?? []).map((type) => ({
			label: `${type.icon ?? ''} ${type.label}`.trim(),
			options: trendsFor(type.id).map((row) => ({
				key: trendKey(row),
				label: trendLabel(row, type, { icon: false }),
				rowLabel: trendLabel(row, type),
				children: childOptions(row)
			}))
		})),
		failed: types === null || rows === null
	};
};

export const actions: Actions = {
	save: async ({ request, locals: { supabase } }) => {
		const { rows } = await current(supabase);
		if (!rows) return fail(503, { message: locale.errors.saveFailed });

		const plan = planTrendList(rows, await request.formData());
		if ('error' in plan) return fail(400, { message: plan.error });

		if (!sameTrends(rows, plan.rows)) {
			const message = await saveTrendConfig(supabase, plan.rows);
			if (message) return fail(400, { message });
		}
		// No redirect: the page stays where it was and toasts.
		return { saved: true };
	}
};
