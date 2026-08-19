import { describe, expect, it } from 'vitest';
import { buildTrendRows, trendBucketKeys } from '$lib/stats/trends';
import * as locale from '$lib/locale';
import type { TrendBucket } from '$lib/types/domain';

const TODAY = '2026-08-14';

function bucket(overrides: Partial<TrendBucket>): TrendBucket {
	return {
		bucket: '2026-08-01',
		walks: 0,
		walk_gap_min: null,
		walk_duration_min: null,
		meal_gap_min: null,
		meal_finish_rate: null,
		accidents: 0,
		...overrides
	};
}

describe('trendBucketKeys', () => {
	it('names the last two complete buckets, never today', () => {
		expect(trendBucketKeys(TODAY, 'day')).toEqual({ prev: '2026-08-12', latest: '2026-08-13' });
		expect(trendBucketKeys(TODAY, 'week')).toEqual({ prev: '2026-07-27', latest: '2026-08-03' });
		expect(trendBucketKeys(TODAY, 'month')).toEqual({ prev: '2026-06-01', latest: '2026-07-01' });
	});
});

describe('buildTrendRows', () => {
	it('always builds one row per metric, so the list keeps its height', () => {
		expect(buildTrendRows(null, null)).toHaveLength(6);
	});

	it('writes the change as a rounded, neutral percentage', () => {
		const up = buildTrendRows(bucket({ walks: 3 }), bucket({ walks: 4 }))[0];
		expect(up.badge).toBe(locale.stats.trends.change('up', 33));

		const down = buildTrendRows(bucket({ walks: 5 }), bucket({ walks: 4 }))[0];
		expect(down.badge).toBe(locale.stats.trends.change('down', 20));

		const flat = buildTrendRows(bucket({ walks: 4 }), bucket({ walks: 4 }))[0];
		expect(flat.badge).toBe(locale.stats.trends.unchanged);
	});

	it('shows a dash instead of an infinite change from a zero base', () => {
		const rows = buildTrendRows(bucket({ walks: 0 }), bucket({ walks: 4 }));
		expect(rows[0].badge).toBe(locale.units.missing);
	});

	it('shows dashes for a metric with no data on either side', () => {
		const rows = buildTrendRows(bucket({}), bucket({}));
		// walk_gap_min is null in both buckets
		expect(rows[1].from).toBe(locale.units.missing);
		expect(rows[1].to).toBe(locale.units.missing);
		expect(rows[1].badge).toBe(locale.units.missing);
	});
});
