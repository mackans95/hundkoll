// Picking one field's row out of a type's metric rows. stats_detail_metrics is
// long — a row per field — and a field nobody has ever logged has no row, which
// is a different answer from a zero.

import { describe, expect, it } from 'vitest';
import * as format from '$lib/format';
import * as locale from '$lib/locale';
import { metricFor, totalEvents } from '$lib/stats/metrics';
import { avgTile, shareTile } from '$lib/stats/summary';
import type { DetailMetric } from '$lib/types/domain';

const ROWS: DetailMetric[] = [
	{
		field: 'duration_min',
		events: 12,
		answered: 12,
		avg_number: 33.75,
		share_true: 0,
		share_not_true: 1
	},
	{
		field: 'accident',
		events: 12,
		answered: 3,
		avg_number: null,
		share_true: 0.25,
		share_not_true: 0.75
	}
];

describe('metricFor', () => {
	it('finds the field asked for', () => {
		expect(metricFor(ROWS, 'duration_min')?.avg_number).toBe(33.75);
		expect(metricFor(ROWS, 'accident')?.share_not_true).toBe(0.75);
	});

	// Null rather than a made-up row: "never logged" has to stay tellable from
	// "logged as zero", because a share reads them differently.
	it('reports a field with no row as null', () => {
		expect(metricFor(ROWS, 'threw_up')).toBeNull();
		expect(metricFor([], 'duration_min')).toBeNull();
	});
});

describe('totalEvents', () => {
	it('sums the days the chart is drawn from', () => {
		expect(
			totalEvents([
				{ day: '2026-08-01', n: 2 },
				{ day: '2026-08-03', n: 1 }
			])
		).toBe(3);
	});

	it('is zero for a type with nothing logged', () => {
		expect(totalEvents([])).toBe(0);
	});
});

describe('avgTile', () => {
	it('writes the average in the field’s own unit, marked as an estimate', () => {
		expect(avgTile('Snittlängd', metricFor(ROWS, 'duration_min'), format.minutesText)).toEqual({
			label: 'Snittlängd',
			value: '~34 min'
		});
	});

	// Nothing to average is a dash, not a zero — a zero would read as "she was
	// in the car for no time at all".
	it('dashes when there is nothing behind it', () => {
		expect(avgTile('Snittlängd', null, format.minutesText).value).toBe(locale.units.missing);
		expect(avgTile('Snittlängd', metricFor(ROWS, 'accident'), format.minutesText).value).toBe(
			locale.units.missing
		);
	});
});

describe('shareTile', () => {
	it('reads a share both ways round', () => {
		expect(shareTile('Med olycka', metricFor(ROWS, 'accident'), 12).value).toBe('25 %');
		expect(shareTile('Utan olycka', metricFor(ROWS, 'accident'), 12, true).value).toBe('75 %');
	});

	// The case the view cannot answer: a reveal that has never been ticked has
	// no row at all, and with rides behind it that means every one went fine.
	it('reads a field never once logged as all of them, when there were events', () => {
		expect(shareTile('Utan olycka', null, 12, true).value).toBe('100 %');
	});

	// Without events it really is unknown, and saying 100 % would invent a fact.
	it('dashes when there were no events either', () => {
		expect(shareTile('Utan olycka', null, 0, true).value).toBe(locale.units.missing);
	});

	// Only the "without" direction can be inferred from absence: how often
	// something DID happen cannot be read off a missing row.
	it('dashes a plain share with no row, whatever the event count', () => {
		expect(shareTile('Med olycka', null, 12).value).toBe(locale.units.missing);
	});
});
