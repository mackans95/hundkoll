// What the household has chosen for each type (plan 26), and the defaults for
// what it has not. A stored null means "the default", so plans 27–29 add a
// field here, a nullable column, and a default, and no existing row changes.

import * as locale from '$lib/locale';
import { CHARTED_TYPES, chartColorKey, PALETTE, type PaletteKey } from '$lib/stats/palette';
import {
	chartPaired,
	parseChart,
	parseTiles,
	planChart,
	planTiles,
	sameChart,
	sameTiles,
	type ChartSpec,
	type TileSpec
} from '$lib/stats/cardSpec';
import type { Json } from '$lib/types/database';
import type { TypeSettingsRow } from '$lib/types/domain';

export type TypeSettings = {
	/** Null for a type with no card on Statistik. */
	chartColor: PaletteKey | null;
	/** Off hides the type from Status and silences its reminders. */
	showOnStatus: boolean;
	/** The Statistik card's tiles (plan 29); empty for a type with no card. */
	tiles: TileSpec[];
	/** The Statistik card's chart (plan 29b); null for a type with no card. */
	chart: ChartSpec | null;
};

/** One type's settings, a missing row and null columns filled from the defaults. */
export function typeSettings(typeId: string, row?: TypeSettingsRow | null): TypeSettings {
	if (!(typeId in CHARTED_TYPES)) {
		return { chartColor: null, showOnStatus: row?.show_on_status ?? true, tiles: [], chart: null };
	}
	const chart = parseChart(typeId, row?.stats_card);
	return {
		chartColor: chartColorKey(typeId, row?.chart_color, chartPaired(chart)),
		showOnStatus: row?.show_on_status ?? true,
		tiles: parseTiles(typeId, row?.stats_card),
		chart
	};
}

/** The columns the update grant allows. */
export type TypeSettingsPatch = Partial<
	Pick<TypeSettingsRow, 'chart_color' | 'show_on_status' | 'stats_card'>
>;

/**
 * Turns the type page's form into the columns it changes, against what is
 * stored. Pure, like planIntervalChanges: an untouched field writes nothing,
 * and a colour outside the palette is refused rather than stored.
 */
export function planTypeSettings(
	typeId: string,
	row: TypeSettingsRow | null,
	form: FormData
): { error: string } | { patch: TypeSettingsPatch } {
	const patch: TypeSettingsPatch = {};
	const current = typeSettings(typeId, row);
	const charted = typeId in CHARTED_TYPES;

	const raw = form.get('chart_color');
	if (raw !== null && charted) {
		const color = String(raw);
		if (!PALETTE.some((entry) => entry.key === color)) {
			return { error: locale.errors.invalidColor };
		}
		// Against what is shown, not what is stored: the radio always posts, and
		// saving an interval should not freeze the default colour into a row.
		// One the chart can't use (Skiffer, once it's split) is kept but drawn as
		// the default, so changing the split never fails a save.
		if (color !== current.chartColor) {
			patch.chart_color = color;
		}
	}

	// An unticked checkbox posts nothing, so the page sends a hidden "false"
	// ahead of it; no value at all means the form had no such field.
	const shown = form.getAll('show_on_status');
	if (shown.length > 0) {
		const show = shown.includes('true');
		if (show !== current.showOnStatus) {
			patch.show_on_status = show;
		}
	}

	if (charted && current.chart) {
		// Each part of the card says it was on the page with a marker, since an
		// empty tile list posts no tile at all.
		const tiles = form.has('tiles_present')
			? planTiles(typeId, current.tiles, form)
			: current.tiles;
		const chart = planChart(typeId, current.chart, form);
		if (!sameTiles(current.tiles, tiles) || !sameChart(current.chart, chart)) {
			const stored = (row?.stats_card ?? {}) as Record<string, Json>;
			patch.stats_card = {
				...stored,
				...(sameTiles(current.tiles, tiles) ? {} : { tiles: tiles as unknown as Json }),
				...(sameChart(current.chart, chart) ? {} : { chart: chart as unknown as Json })
			};
		}
	}

	return { patch };
}
