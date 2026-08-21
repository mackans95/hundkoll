// The calendar's pure parts: which cells a month has, which instants it
// spans, and how a month of rows becomes day summaries.

import { describe, expect, it } from 'vitest';
import { ICON_LIMIT, summariseDays } from '$lib/history';
import * as time from '$lib/time';
import type { EventRow } from '$lib/types/domain';

describe('calendarDays', () => {
	it('pads a month that starts mid-week, Monday first', () => {
		// 2026-08-01 is a Saturday, so five blanks precede it.
		const cells = time.calendarDays('2026-08');
		expect(cells.slice(0, 6)).toEqual([null, null, null, null, null, '2026-08-01']);
		expect(cells.filter(Boolean).at(-1)).toBe('2026-08-31');
	});

	it('always returns whole weeks', () => {
		for (const month of ['2026-01', '2026-02', '2026-08', '2026-12', '2024-02']) {
			expect(time.calendarDays(month).length % 7).toBe(0);
		}
	});

	it('leaves no blanks in a month that fills its weeks exactly', () => {
		// February 2027 starts on a Monday and has 28 days: four clean weeks.
		const cells = time.calendarDays('2027-02');
		expect(cells).toHaveLength(28);
		expect(cells.every((cell) => cell !== null)).toBe(true);
	});

	it('counts February right in a leap year and a common one', () => {
		expect(time.calendarDays('2024-02').filter(Boolean)).toHaveLength(29);
		expect(time.calendarDays('2026-02').filter(Boolean)).toHaveLength(28);
	});

	it('holds every day exactly once, in order, across a year turn', () => {
		const december = time.calendarDays('2026-12').filter(Boolean);
		expect(december).toHaveLength(31);
		expect(december[0]).toBe('2026-12-01');
		expect(december.at(-1)).toBe('2026-12-31');
		expect(new Set(december).size).toBe(31);

		const january = time.calendarDays('2027-01').filter(Boolean);
		expect(january[0]).toBe('2027-01-01');
		expect(january.at(-1)).toBe('2027-01-31');
	});
});

describe('monthBoundsUtc', () => {
	it('spans Stockholm midnight to Stockholm midnight in summer (+2)', () => {
		expect(time.monthBoundsUtc('2026-08')).toEqual({
			from: '2026-07-31T22:00:00.000Z',
			to: '2026-08-31T22:00:00.000Z'
		});
	});

	it('spans Stockholm midnight to Stockholm midnight in winter (+1)', () => {
		expect(time.monthBoundsUtc('2026-01')).toEqual({
			from: '2025-12-31T23:00:00.000Z',
			to: '2026-01-31T23:00:00.000Z'
		});
	});

	it('handles the months DST switches inside, each end on its own offset', () => {
		// Clocks go forward 2026-03-29: the month opens on +1, closes on +2.
		expect(time.monthBoundsUtc('2026-03')).toEqual({
			from: '2026-02-28T23:00:00.000Z',
			to: '2026-03-31T22:00:00.000Z'
		});
		// And back on 2026-10-25: opens on +2, closes on +1.
		expect(time.monthBoundsUtc('2026-10')).toEqual({
			from: '2026-09-30T22:00:00.000Z',
			to: '2026-10-31T23:00:00.000Z'
		});
	});

	it('rejects anything that is not a real month, so a URL cannot widen it', () => {
		for (const month of ['', '2026', '2026-13', '2026-00', 'august', '2026-8', '2026-08-14']) {
			expect(time.monthBoundsUtc(month)).toBeNull();
		}
	});
});

describe('stockholmDay', () => {
	it('gives the day it felt like, not the UTC day', () => {
		// 22:30 UTC in August is 00:30 the next day in Stockholm.
		expect(time.stockholmDay(new Date('2026-08-14T22:30:00Z'))).toBe('2026-08-15');
		expect(time.stockholmDay(new Date('2026-08-14T21:00:00Z'))).toBe('2026-08-14');
	});
});

describe('summariseDays', () => {
	function event(occurredAt: string, icon: string | null): EventRow {
		return {
			id: occurredAt,
			type_id: 'walk',
			occurred_at: occurredAt,
			details: {},
			note: null,
			type: icon === null ? null : { label: 'Promenad', icon }
		};
	}

	it('counts per Stockholm day and keeps the first few icons', () => {
		const summaries = summariseDays([
			event('2026-08-14T05:00:00Z', '🐾'),
			event('2026-08-14T09:00:00Z', '🍽️'),
			event('2026-08-14T22:30:00Z', '⚠️')
		]);

		// The 22:30Z one belongs to the 15th in Stockholm.
		expect(summaries['2026-08-14']).toEqual({ count: 2, icons: ['🐾', '🍽️'] });
		expect(summaries['2026-08-15']).toEqual({ count: 1, icons: ['⚠️'] });
	});

	it('caps icons but keeps counting, which is what "+n" is drawn from', () => {
		const many = Array.from({ length: 7 }, (_, i) => event(`2026-08-14T0${i}:00:00Z`, '🐾'));
		const summary = summariseDays(many)['2026-08-14'];

		expect(summary.count).toBe(7);
		expect(summary.icons).toHaveLength(ICON_LIMIT);
	});

	it('skips a missing icon without losing the count', () => {
		const summary = summariseDays([event('2026-08-14T05:00:00Z', null)])['2026-08-14'];
		expect(summary).toEqual({ count: 1, icons: [] });
	});

	it('leaves days with nothing logged absent', () => {
		expect(summariseDays([])).toEqual({});
		expect(summariseDays([event('2026-08-14T05:00:00Z', '🐾')])['2026-08-13']).toBeUndefined();
	});
});
