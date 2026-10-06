import { describe, expect, it } from 'vitest';
import { simpleCountBuckets } from '$lib/stats/buckets';
import type { SimpleDay } from '$lib/types/domain';

const TODAY = '2026-08-14';

// Called only from the card template npm run new-event generates, so nothing
// else would catch it breaking until someone adds an event type.
describe('simpleCountBuckets', () => {
	// Biltur's tooltip (plan 22, after Ensamtid): the count with the day's
	// length, then Olycka with what happened boxed under it.
	it("nests a reveal's causes under it and gives the day's mean length", () => {
		const buckets = simpleCountBuckets([{ day: TODAY, n: 2 }], TODAY, 'Biltur', '#000', {
			typeId: 'car_ride',
			counts: [
				{ day: TODAY, field: 'duration_min', n: 2, sum: 61 },
				{ day: TODAY, field: 'accident', n: 1 },
				{ day: TODAY, field: 'pooped', n: 1 },
				{ day: TODAY, field: 'threw_up', n: 1 }
			]
		});
		expect(buckets[29].tooltip.rows).toEqual([
			[
				{ label: 'Biltur', value: '2', color: '#000' },
				{ label: 'Längd', value: '~31 min' }
			],
			[{ label: 'Olycka:', value: '1' }],
			{
				nested: [
					[
						{ label: 'Bajsade', value: '1' },
						{ label: 'Spydde', value: '1' }
					]
				]
			}
		]);
	});

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
		expect(buckets[29].tooltip.rows[0]).toEqual([
			{ label: 'Klokoll', value: '4', color: 'var(--chart-x)' }
		]);
	});

	it('ignores rows outside the window rather than shifting the columns', () => {
		const buckets = simpleCountBuckets([{ day: '2026-01-01', n: 9 }], TODAY, 'Klokoll', '#000');
		expect(buckets).toHaveLength(30);
		expect(buckets.every((bucket) => bucket.segments[0] === 0)).toBe(true);
	});
});
