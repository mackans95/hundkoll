import { error, fail } from '@sveltejs/kit';
import * as locale from '$lib/locale';
import { listEventTypes, saveInterval } from '$lib/server/care';
import { readsFailed } from '$lib/server/reads';
import { listTypeSettings, saveTypeSettings } from '$lib/server/typeSettings';
import { CHARTED_TYPES, PALETTE } from '$lib/stats/palette';
import { fieldsFor, shortFieldLabel } from '$lib/events/fields';
import { typeSettings } from '$lib/typeSettings';
import { readTrendConfig, saveTrendConfig } from '$lib/server/trendSettings';
import {
	sameTrends,
	setTypeTrends,
	trendKey,
	trendMetricLabel,
	trendsFor
} from '$lib/stats/trendConfig';
import type { Db } from '$lib/server/db';
import { readCardConfig, saveCardConfig } from '$lib/server/statsSettings';
import { sameCards, setCardShown } from '$lib/stats/cardConfig';
import {
	splitKey,
	splitLabel,
	splitsFor,
	tileKey,
	tileLabel,
	tilesFor,
	timelineFieldsFor,
	tooltipDetailsFor,
	defaultDetails,
	detailLabel,
	type ChartSpec
} from '$lib/stats/cardSpec';
import type { Actions, PageServerLoad } from './$types';

/** The chart as the page's controls hold it. */
function chartForm(typeId: string, chart: ChartSpec | null) {
	const shown = chart?.details ?? defaultDetails(typeId);
	return {
		kind: chart?.kind ?? 'bars',
		split: chart?.kind === 'bars' ? splitKey(chart.split) : 'none',
		picker: chart?.picker ?? false,
		tooltip: chart?.tooltip ?? ('text' as const),
		field: chart?.kind === 'timeline' ? chart.field : (timelineFieldsFor(typeId)[0] ?? ''),
		every: chart?.kind === 'timeline' ? chart.every : true,
		// Ticked first, in their order, then the rest the type allows.
		details: [
			...shown,
			...tooltipDetailsFor(typeId).filter((detail) => !shown.includes(detail))
		].map((detail) => ({
			key: detail,
			label: detailLabel(typeId, detail),
			on: shown.includes(detail)
		}))
	};
}

export const load: PageServerLoad = async ({ params, setHeaders, locals: { supabase } }) => {
	const [types, settings] = await Promise.all([
		listEventTypes(supabase),
		listTypeSettings(supabase)
	]);
	const [trends, cards] = await Promise.all([
		types ? readTrendConfig(supabase, new Set(types.map((t) => t.id))) : null,
		readCardConfig(supabase)
	]);
	readsFailed(setHeaders, types, settings, trends, cards);

	const type = types?.find((candidate) => candidate.id === params.id);
	if (types && !type) {
		error(404, locale.errors.unknownType);
	}

	return {
		// Null only when the catalogue read failed; the page says so instead of a form.
		type: type ?? null,
		settings: typeSettings(params.id, settings?.get(params.id)),
		// Every entry: the page drops the neutral while the chart it shows is split.
		palette: params.id in CHARTED_TYPES ? PALETTE : [],
		chart: chartForm(params.id, typeSettings(params.id, settings?.get(params.id)).chart),
		splitOptions:
			params.id in CHARTED_TYPES
				? splitsFor(params.id).map((split) => ({
						key: splitKey(split),
						label: splitLabel(params.id, split)
					}))
				: [],
		timelineOptions:
			params.id in CHARTED_TYPES
				? timelineFieldsFor(params.id).map((name) => ({
						key: name,
						label: shortFieldLabel(
							fieldsFor(params.id).find((field) => field.name === name)?.label ?? name
						)
					}))
				: [],
		// The absence type is the banner on Status, never a card, so there is nothing to hide.
		statusOption: type?.category !== 'absence',
		// Only a type with a card on Statistik has one to show or hide.
		statsOption: params.id in CHARTED_TYPES,
		// The card's tiles as captions, and every tile the type's fields allow.
		tiles: typeSettings(params.id, settings?.get(params.id)).tiles.map((tile) => ({
			key: tileKey(tile),
			label: tileLabel(params.id, tile)
		})),
		tileOptions:
			params.id in CHARTED_TYPES
				? tilesFor(params.id).map((tile) => ({
						key: tileKey(tile),
						label: tileLabel(params.id, tile)
					}))
				: [],
		showOnStats: (cards ?? []).find((card) => card.type === params.id)?.shown ?? true,
		trends: trendsFor(params.id).map((row) => ({
			key: trendKey(row),
			label: trendMetricLabel(row),
			on: (trends ?? []).some((listed) => trendKey(listed) === trendKey(row))
		})),
		// A form over defaults it could not read would save over the real choice.
		failed: types === null || settings === null || trends === null || cards === null
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

/** The page's Statistik switch, applied to the household's card list if it changed it. */
async function saveTypeCard(db: Db, typeId: string, form: FormData): Promise<string | null> {
	const posted = form.getAll('show_on_stats');
	if (posted.length === 0 || !(typeId in CHARTED_TYPES)) {
		return null;
	}
	const before = await readCardConfig(db);
	if (!before) {
		return locale.errors.saveFailed;
	}
	const after = setCardShown(before, typeId, posted.includes('true'));
	return sameCards(before, after) ? null : saveCardConfig(db, after);
}

export const actions: Actions = {
	save: async ({ params, request, locals: { supabase } }) => {
		const form = await request.formData();
		const message =
			(await saveInterval(supabase, params.id, form)) ??
			(await saveTypeSettings(supabase, params.id, form)) ??
			(await saveTypeTrends(supabase, params.id, form)) ??
			(await saveTypeCard(supabase, params.id, form));
		if (message) {
			return fail(400, { message });
		}
		// No redirect: the page stays where it was and toasts.
		return { saved: true };
	}
};
