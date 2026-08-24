import { describe, expect, it } from 'vitest';
import { accidentBuckets, mealBuckets, simpleCountBuckets, walkBuckets } from '$lib/stats/buckets';
import * as format from '$lib/format';
import type { AccidentBin, MealDay, SimpleDay, WalkDay } from '$lib/types/domain';

const TODAY = '2026-08-14';

// Called only from the card template npm run new-event generates, so nothing
// else would catch it breaking until someone adds an event type.
describe('simpleCountBuckets', () => {
	it('zero-fills the same 30-day window as the hand-written builders', () => {
		const buckets = simpleCountBuckets([], TODAY, 'Klokoll', 'var(--chart-x)');
		expect(buckets).toHaveLength(30);
		expect(buckets[0].label).toBe('16/7');
		expect(buckets[29].label).toBe('14/8');
		expect(buckets.every((bucket) => bucket.segments.length === 1)).toBe(true);
	});

	it('places a day’s count in its own column and labels the tooltip', () => {
		const days: SimpleDay[] = [{ day: TODAY, n: 4 }];
		const buckets = simpleCountBuckets(days, TODAY, 'Klokoll', 'var(--chart-x)');

		expect(buckets[29].segments).toEqual([4]);
		expect(buckets[28].segments).toEqual([0]);
		expect(buckets[29].tooltip.rows[0][0]).toEqual({
			label: 'Klokoll',
			value: '4',
			color: 'var(--chart-x)'
		});
	});

	it('ignores rows outside the window rather than shifting the columns', () => {
		const buckets = simpleCountBuckets([{ day: '2026-01-01', n: 9 }], TODAY, 'Klokoll', '#000');
		expect(buckets).toHaveLength(30);
		expect(buckets.every((bucket) => bucket.segments[0] === 0)).toBe(true);
	});
});

describe('walkBuckets', () => {
	it('zero-fills 30 days with a tick every 7th column', () => {
		const buckets = walkBuckets([], TODAY);
		expect(buckets).toHaveLength(30);
		expect(buckets[0].label).toBe('16/7');
		expect(buckets[29].label).toBe('14/8');
		expect(buckets.every((b) => b.segments.length === 1 && b.segments[0] === 0)).toBe(true);
		expect(buckets.map((b) => b.tick).slice(0, 8)).toEqual([
			true,
			false,
			false,
			false,
			false,
			false,
			false,
			true
		]);
	});

	it('places a day with walks in its own column', () => {
		const day: WalkDay = {
			day: TODAY,
			n: 3,
			pee: 2,
			poop: 1,
			avg_gap_min: null,
			avg_duration_min: null
		};
		const buckets = walkBuckets([day], TODAY);
		expect(buckets[29].segments).toEqual([3]);
		expect(buckets[28].segments).toEqual([0]);
	});
});

describe('mealBuckets', () => {
	it('splits a day into finished, not finished and unknown', () => {
		const day: MealDay = {
			day: TODAY,
			n: 3,
			finished_true: 1,
			finished_false: 1,
			avg_gap_min: null
		};
		expect(mealBuckets([day], TODAY)[29].segments).toEqual([1, 1, 1]);
	});

	it('never lets a miscounted day produce a negative unknown segment', () => {
		const day: MealDay = {
			day: TODAY,
			n: 1,
			finished_true: 2,
			finished_false: 0,
			avg_gap_min: null
		};
		expect(mealBuckets([day], TODAY)[29].segments).toEqual([2, 0, 0]);
	});
});

describe('accidentBuckets', () => {
	it('covers 30 days in the day view', () => {
		expect(accidentBuckets([], 'day', TODAY)).toHaveLength(30);
	});

	it('covers 12 Monday-aligned weeks, the current one last', () => {
		const bin: AccidentBin = { bucket: '2026-08-10', n: 3, pee: 1, poop: 1 };
		const buckets = accidentBuckets([bin], 'week', TODAY);
		expect(buckets).toHaveLength(12);
		expect(buckets[11].label).toBe(format.weekLabel('2026-08-10'));
		// pee, poop, and the one logged without saying which
		expect(buckets[11].segments).toEqual([1, 1, 1]);
	});

	it('covers 12 months aligned to the 1st, the current one last', () => {
		const bin: AccidentBin = { bucket: '2026-08-01', n: 2, pee: 2, poop: 0 };
		const buckets = accidentBuckets([bin], 'month', TODAY);
		expect(buckets).toHaveLength(12);
		expect(buckets[11].label).toBe(format.monthLabel('2026-08-01'));
		expect(buckets[11].segments).toEqual([2, 0, 0]);
		expect(buckets[0].label).toBe(format.monthLabel('2025-09-01'));
	});
});
