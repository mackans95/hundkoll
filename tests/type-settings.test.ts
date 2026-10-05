// Per-type settings (plan 26): which colour a type is drawn in, given what is
// stored, and what the type page's form asks to change.

import { describe, expect, it } from 'vitest';
import * as locale from '$lib/locale';
import { chartColorKey, paletteFor } from '$lib/stats/palette';
import { planTypeSettings, typeSettings } from '$lib/typeSettings';

const form = (fields: Record<string, string>) => {
	const data = new FormData();
	for (const [key, value] of Object.entries(fields)) data.set(key, value);
	return data;
};

describe('chartColorKey', () => {
	it('keeps the look each card had before it was configurable', () => {
		expect(chartColorKey('walk', null)).toBe('green');
		expect(chartColorKey('weight', undefined)).toBe('blue');
		expect(chartColorKey('accident', null)).toBe('amber');
		expect(chartColorKey('car_ride', null)).toBe('slate');
	});

	it('reads a stored key, and a stale one as unset', () => {
		expect(chartColorKey('walk', 'violet')).toBe('violet');
		expect(chartColorKey('walk', 'rose')).toBe('green');
	});

	it('keeps the neutral off a card that pairs it with the greys', () => {
		expect(paletteFor('meal').map((entry) => entry.key)).not.toContain('slate');
		expect(paletteFor('walk').map((entry) => entry.key)).toContain('slate');
		expect(chartColorKey('alone', 'slate')).toBe('green');
	});
});

describe('typeSettings', () => {
	it('fills a missing row from the defaults', () => {
		expect(typeSettings('walk')).toEqual({ chartColor: 'green' });
	});

	it('has no colour for a type without a card', () => {
		expect(typeSettings('bath', { type_id: 'bath', chart_color: 'blue' })).toEqual({
			chartColor: null
		});
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

	it('refuses a colour the type may not use', () => {
		expect(planTypeSettings('meal', null, form({ chart_color: 'slate' }))).toEqual({
			error: locale.errors.invalidColor
		});
		expect(planTypeSettings('walk', null, form({ chart_color: '#ff0000' }))).toEqual({
			error: locale.errors.invalidColor
		});
	});

	it('ignores a colour posted for a type without a card', () => {
		expect(planTypeSettings('bath', null, form({ chart_color: 'blue' }))).toEqual({ patch: {} });
	});
});
