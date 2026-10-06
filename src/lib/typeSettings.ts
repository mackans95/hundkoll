// What the household has chosen for each type (plan 26), and the defaults for
// what it has not. A stored null means "the default", so plans 27–29 add a
// field here, a nullable column, and a default, and no existing row changes.

import * as locale from '$lib/locale';
import { CHARTED_TYPES, chartColorKey, paletteFor, type PaletteKey } from '$lib/stats/palette';
import { parseTiles, planTiles, sameTiles, type TileSpec } from '$lib/stats/cardSpec';
import type { Json } from '$lib/types/database';
import type { TypeSettingsRow } from '$lib/types/domain';

export type TypeSettings = {
	/** Null for a type with no card on Statistik. */
	chartColor: PaletteKey | null;
	/** Off hides the type from Status and silences its reminders. */
	showOnStatus: boolean;
	/** The Statistik card's tiles (plan 29); empty for a type with no card. */
	tiles: TileSpec[];
};

/** One type's settings, a missing row and null columns filled from the defaults. */
export function typeSettings(typeId: string, row?: TypeSettingsRow | null): TypeSettings {
	return {
		chartColor: typeId in CHARTED_TYPES ? chartColorKey(typeId, row?.chart_color) : null,
		showOnStatus: row?.show_on_status ?? true,
		tiles: typeId in CHARTED_TYPES ? parseTiles(typeId, row?.stats_card) : []
	};
}

/** The columns the update grant allows. */
export type TypeSettingsPatch = Partial<
	Pick<TypeSettingsRow, 'chart_color' | 'show_on_status' | 'stats_card'>
>;

/**
 * Turns the type page's form into the columns it changes, against what is
 * stored. Pure, like planIntervalChanges: an untouched field writes nothing,
 * and a colour the type may not use is refused rather than stored.
 */
export function planTypeSettings(
	typeId: string,
	row: TypeSettingsRow | null,
	form: FormData
): { error: string } | { patch: TypeSettingsPatch } {
	const patch: TypeSettingsPatch = {};

	const raw = form.get('chart_color');
	if (raw !== null && typeId in CHARTED_TYPES) {
		const color = String(raw);
		if (!paletteFor(typeId).some((entry) => entry.key === color)) {
			return { error: locale.errors.invalidColor };
		}
		// Against what is shown, not what is stored: the radio always posts, and
		// saving an interval should not freeze the default colour into a row.
		if (color !== typeSettings(typeId, row).chartColor) {
			patch.chart_color = color;
		}
	}

	// An unticked checkbox posts nothing, so the page sends a hidden "false"
	// ahead of it; no value at all means the form had no such field.
	const shown = form.getAll('show_on_status');
	if (shown.length > 0) {
		const show = shown.includes('true');
		if (show !== typeSettings(typeId, row).showOnStatus) {
			patch.show_on_status = show;
		}
	}

	// The tile list says it was on the page with a marker, since an empty list
	// posts no tile at all.
	if (form.has('tiles_present') && typeId in CHARTED_TYPES) {
		const current = typeSettings(typeId, row).tiles;
		const next = planTiles(typeId, current, form);
		if (!sameTiles(current, next)) {
			// Kept beside whatever else the card holds, which 29b's chart choices join.
			const stored = (row?.stats_card ?? {}) as Record<string, Json>;
			patch.stats_card = { ...stored, tiles: next as unknown as Json };
		}
	}

	return { patch };
}
