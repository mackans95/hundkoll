// Per-type settings (plan 26): which colour a type is drawn in, given what is
// stored, and what the type page's form asks to change.

import { describe, expect, it } from 'vitest';
import * as locale from '$lib/locale';
import { chartColorKey, paletteFor } from '$lib/stats/palette';
import { planTypeSettings, typeSettings } from '$lib/typeSettings';

const form = (fields: Record<string, string | string[]>) => {
	const data = new FormData();
	for (const [key, value] of Object.entries(fields)) {
		for (const one of [value].flat()) data.append(key, one);
	}
	return data;
};

describe('chartColorKey', () => {
	it('keeps the look each card had before it was configurable', () => {
		expect(chartColorKey('walk', null, false)).toBe('green');
		expect(chartColorKey('weight', undefined, false)).toBe('blue');
		expect(chartColorKey('accident', null, true)).toBe('amber');
		expect(chartColorKey('car_ride', null, false)).toBe('slate');
	});

	it('reads a stored key, and a stale one as unset', () => {
		expect(chartColorKey('walk', 'violet', false)).toBe('violet');
		expect(chartColorKey('walk', 'rose', false)).toBe('green');
	});

	it('keeps the neutral off a split chart, which pairs it with the greys', () => {
		expect(paletteFor(true).map((entry) => entry.key)).not.toContain('slate');
		expect(paletteFor(false).map((entry) => entry.key)).toContain('slate');
		expect(chartColorKey('alone', 'slate', true)).toBe('green');
		// Biltur's default is the neutral; split, it falls to the first that pairs.
		expect(chartColorKey('car_ride', null, true)).toBe('green');
	});
});

describe('typeSettings', () => {
	it('fills a missing row from the defaults', () => {
		expect(typeSettings('walk')).toMatchObject({ chartColor: 'green', showOnStatus: true });
	});

	it('has no colour for a type without a card', () => {
		expect(
			typeSettings('bath', {
				type_id: 'bath',
				chart_color: 'blue',
				show_on_status: null,
				stats_card: null
			})
		).toEqual({ chartColor: null, showOnStatus: true, tiles: [], chart: null });
	});
});

describe('planTypeSettings', () => {
	it('writes nothing when the form shows what is already in effect', () => {
		// The radio always posts; the default must not be frozen into a row.
		expect(planTypeSettings('walk', null, form({ chart_color: 'green' }))).toEqual({ patch: {} });
	});

	it('writes a changed colour', () => {
		expect(planTypeSettings('walk', null, form({ chart_color: 'pink' }))).toEqual({
			patch: { chart_color: 'pink' }
		});
	});

	it('refuses a colour outside the palette', () => {
		expect(planTypeSettings('walk', null, form({ chart_color: '#ff0000' }))).toEqual({
			error: locale.errors.invalidColor
		});
	});

	// Changing the split must never fail a save: the neutral is kept, and drawn
	// as the default while the chart is split.
	it('keeps the neutral on a split chart, drawn as the default', () => {
		const saved = planTypeSettings('meal', null, form({ chart_color: 'slate' }));
		expect(saved).toEqual({ patch: { chart_color: 'slate' } });
		const row = { type_id: 'meal', chart_color: 'slate', show_on_status: null, stats_card: null };
		expect(typeSettings('meal', row).chartColor).toBe('green');
	});

	it('ignores a colour posted for a type without a card', () => {
		expect(planTypeSettings('bath', null, form({ chart_color: 'blue' }))).toEqual({ patch: {} });
	});

	// The page posts a hidden "false" ahead of the checkbox's "true".
	it('hides a type from Status when the box is unticked', () => {
		expect(planTypeSettings('accident', null, form({ show_on_status: 'false' }))).toEqual({
			patch: { show_on_status: false }
		});
	});

	it('shows it again when ticked, and writes nothing when unchanged', () => {
		const hidden = {
			type_id: 'accident',
			chart_color: null,
			show_on_status: false,
			stats_card: null
		};
		expect(
			planTypeSettings('accident', hidden, form({ show_on_status: ['false', 'true'] }))
		).toEqual({ patch: { show_on_status: true } });
		expect(planTypeSettings('accident', null, form({ show_on_status: ['false', 'true'] }))).toEqual(
			{ patch: {} }
		);
	});

	it('leaves Status alone when the form has no such field', () => {
		const hidden = {
			type_id: 'accident',
			chart_color: null,
			show_on_status: false,
			stats_card: null
		};
		expect(planTypeSettings('accident', hidden, form({}))).toEqual({ patch: {} });
	});
});
