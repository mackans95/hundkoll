// Ensamtid's chart and tiles (plan 22): the per-day split with what each
// outcome said, the share calm, the longest calm stretch, and the tooltip
// that keeps Orolig's signs inside Orolig.

import { describe, expect, it } from 'vitest';
import { fieldsFor, fieldsRevealedBy } from '$lib/events/fields';
import * as locale from '$lib/locale';
import { aloneBuckets } from '$lib/stats/buckets';
import { answeredShare, longestWhen, outcomeDays } from '$lib/stats/outcomes';
import { ALONE_COLORS } from '$lib/stats/palette';

const row = (occurred_at: string, details: Record<string, number | boolean>) => ({
	occurred_at,
	details
});

const SPEC = {
	outcome: 'calm',
	measure: 'duration_min',
	revealed: fieldsRevealedBy(fieldsFor('alone'), 'calm')
};

// 27 sep: one calm, two anxious (with signs and times), one unknown.
const rows = [
	row('2026-09-27T08:00:00Z', { duration_min: 50, calm: true }),
	row('2026-09-27T10:00:00Z', {
		duration_min: 30,
		calm: false,
		anxious_after_min: 12,
		howled: true,
		restless: true
	}),
	row('2026-09-27T14:00:00Z', {
		duration_min: 34,
		calm: false,
		anxious_after_min: 16,
		howled: true
	}),
	row('2026-09-27T16:00:00Z', { duration_min: 20 }),
	// 23:30 UTC is the next day in Stockholm.
	row('2026-09-27T23:30:00Z', { duration_min: 45, calm: true })
];

describe('outcomeDays', () => {
	const [day, next] = outcomeDays(rows, SPEC);

	it('splits each Stockholm day by outcome', () => {
		expect([day.day, day.n, day.yes.count, day.no.count, day.unknown.count]).toEqual([
			'2026-09-27',
			4,
			1,
			2,
			1
		]);
		expect([next.day, next.n, next.yes.count]).toEqual(['2026-09-28', 1, 1]);
	});

	it("keeps each outcome's own length and what was said under it", () => {
		expect(day.measure).toEqual({ sum: 134, n: 4 });
		expect(day.no.measure).toEqual({ sum: 64, n: 2 });
		expect(day.no.numbers.anxious_after_min).toEqual({ sum: 28, n: 2 });
		expect(day.no.counts).toEqual({ howled: 2, restless: 1 });
		expect(day.yes.counts).toEqual({});
	});
});

describe('answeredShare', () => {
	// Two calm of four answered; the Vet ej one neither helps nor hurts.
	it('divides by the answered ones only', () => {
		expect(answeredShare(outcomeDays(rows, SPEC))).toBeCloseTo(2 / 4);
	});

	it('is null with nothing answered', () => {
		expect(answeredShare(outcomeDays([rows[3]], SPEC))).toBeNull();
	});
});

describe('longestWhen', () => {
	it('takes the longest alone time she was calm through', () => {
		expect(longestWhen(rows, 'duration_min', 'calm')).toBe(50);
	});

	it('is null when she was never known to be calm', () => {
		expect(longestWhen([rows[1], rows[3]], 'duration_min', 'calm')).toBeNull();
	});
});

describe('aloneBuckets tooltip', () => {
	const words = locale.stats.alone;
	const buckets = aloneBuckets(outcomeDays(rows, SPEC), '2026-09-28');
	const day = buckets[28];

	it('stacks Lugn, Orolig, Vet ej', () => {
		expect(day.segments).toEqual([1, 2, 1]);
	});

	// The mock-up agreed on: count and length like the walk tooltip, then a row
	// per outcome, and Orolig's time and signs boxed under Orolig.
	it('nests the signs under Orolig instead of beside it', () => {
		expect(day.tooltip.rows).toEqual([
			[
				{ label: '🏠', value: '4', big: true },
				{ label: words.length, value: '~34 min' }
			],
			[{ label: `${words.legendCalm}:`, value: '1', color: ALONE_COLORS[0] }, { value: '50 min' }],
			[
				{ label: `${words.legendAnxious}:`, value: '2', color: ALONE_COLORS[1] },
				{ value: '~32 min' }
			],
			{
				nested: [
					[{ label: words.after, value: '~14 min' }],
					[
						{ label: 'Ylade', value: '2' },
						{ label: 'Rastlös', value: '1' }
					]
				]
			},
			[
				{ label: `${words.legendUnknown}:`, value: '1', color: ALONE_COLORS[2] },
				{ value: '20 min' }
			]
		]);
	});

	it('shows only what happened: a calm-only day has no box', () => {
		expect(buckets[29].tooltip.rows).toEqual([
			[
				{ label: '🏠', value: '1', big: true },
				{ label: words.length, value: '45 min' }
			],
			[{ label: `${words.legendCalm}:`, value: '1', color: ALONE_COLORS[0] }, { value: '45 min' }]
		]);
	});

	it('says zero on an empty day', () => {
		expect(buckets[0].tooltip.rows).toEqual([
			[{ label: words.emptyTooltip, value: '0', color: ALONE_COLORS[0] }]
		]);
	});
});
