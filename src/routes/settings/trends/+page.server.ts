import { fail, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import * as locale from '$lib/locale';
import { listEventTypes } from '$lib/server/care';
import { readsFailed } from '$lib/server/reads';
import { readTrendConfig, saveTrendConfig } from '$lib/server/trendSettings';
import {
	addTrend,
	planTrendList,
	sameTrends,
	trendKey,
	trendLabel,
	trendsFor,
	type TrendConfigRow
} from '$lib/stats/trendConfig';
import type { Db } from '$lib/server/db';
import type { Actions, PageServerLoad } from './$types';

/** The catalogue and the list it validates, read together for load and actions alike. */
async function current(db: Db) {
	const types = await listEventTypes(db);
	const rows = types ? await readTrendConfig(db, new Set(types.map((type) => type.id))) : null;
	return { types, rows };
}

export const load: PageServerLoad = async ({ url, setHeaders, locals: { supabase } }) => {
	const { types, rows } = await current(supabase);
	readsFailed(setHeaders, types, rows);

	const list = rows ?? [];
	const listed = new Set(list.map(trendKey));
	const byId = new Map((types ?? []).map((type) => [type.id, type]));

	return {
		rows: list.map((row) => ({
			key: trendKey(row),
			label: trendLabel(row, byId.get(row.type)),
			better: row.better
		})),
		// What the add picker offers, grouped by type, minus what the list has.
		available: (types ?? [])
			.map((type) => ({
				label: `${type.icon ?? ''} ${type.label}`.trim(),
				options: trendsFor(type.id)
					.filter((row) => !listed.has(trendKey(row)))
					.map((row) => ({ key: trendKey(row), label: trendLabel(row, type) }))
			}))
			.filter((group) => group.options.length > 0),
		failed: types === null || rows === null,
		saved: url.searchParams.has('saved')
	};
};

/** Saves a changed list and lands back on the page. */
async function store(db: Db, before: TrendConfigRow[], after: TrendConfigRow[]) {
	if (!sameTrends(before, after)) {
		const message = await saveTrendConfig(db, after);
		if (message) {
			return fail(400, { message });
		}
	}
	redirect(303, resolve('/settings/trends') + '?saved');
}

export const actions: Actions = {
	save: async ({ request, locals: { supabase } }) => {
		const { rows } = await current(supabase);
		if (!rows) return fail(503, { message: locale.errors.saveFailed });
		const plan = planTrendList(rows, await request.formData());
		if ('error' in plan) return fail(400, { message: plan.error });
		return store(supabase, rows, plan.rows);
	},
	add: async ({ request, locals: { supabase } }) => {
		const { rows } = await current(supabase);
		if (!rows) return fail(503, { message: locale.errors.saveFailed });
		const key = String((await request.formData()).get('key') ?? '');
		return store(supabase, rows, addTrend(rows, key));
	}
};
