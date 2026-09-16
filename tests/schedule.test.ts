// The rules the Status page sorts and phrases its rows by. The first two read
// only the unit column plan 15 added; the third is the one place the clock
// comes into it, and it is passed in rather than read.

import { describe, expect, it } from 'vitest';
import { intervalText } from '$lib/format';
import { awaitingNewDay, isDaily, isScheduled } from '$lib/status/schedule';
import type { StatusRow } from '$lib/types/domain';

const row = (part: Partial<StatusRow>): StatusRow => ({
	dog_id: 'dog-1',
	type_id: 'walk',
	label: 'Promenad',
	category: 'routine',
	icon: null,
	interval: null,
	interval_type: 'days',
	last_at: null,
	due_at: null,
	sort_order: 0,
	...part
});

describe('isScheduled', () => {
	it('is true for a fixed number of days', () => {
		expect(isScheduled(row({ interval_type: 'days', interval: 42 }))).toBe(true);
	});

	// deworming, vet, weight: they happen when they happen.
	it('is false for days with no number', () => {
		expect(isScheduled(row({ interval_type: 'days', interval: null }))).toBe(false);
	});

	// The number is only the remembered fixed value here; the schedule comes
	// from the 30-day average, so a null number does not mean "no schedule".
	it('is true for average mode even with no number', () => {
		expect(isScheduled(row({ interval_type: 'average', interval: null }))).toBe(true);
	});

	it('is true for a fixed number of hours', () => {
		expect(isScheduled(row({ interval_type: 'hours', interval: 4 }))).toBe(true);
	});

	// Hours chosen but nothing typed: Settings should not allow it, and if it
	// happens anyway the type has no expectation to show.
	it('is false for hours with no number', () => {
		expect(isScheduled(row({ interval_type: 'hours', interval: null }))).toBe(false);
	});
});

describe('isDaily', () => {
	it('is false for days, whatever the number', () => {
		expect(isDaily(row({ interval_type: 'days', interval: 42 }))).toBe(false);
		expect(isDaily(row({ interval_type: 'days', interval: null }))).toBe(false);
	});

	it('is true for hours and for average', () => {
		expect(isDaily(row({ interval_type: 'hours', interval: 4 }))).toBe(true);
		expect(isDaily(row({ interval_type: 'average', interval: null }))).toBe(true);
	});
});

describe('awaitingNewDay', () => {
	// The clock matters here and only here, so it is passed in. Summer: Stockholm
	// is UTC+2, which makes the first case a trap on purpose — both instants are
	// the same UTC date and different Stockholm days.
	const daily = (last_at: string | null) => row({ interval_type: 'average', last_at });

	it('is true once the Stockholm day has turned since the last event', () => {
		// 23:00 Stockholm on the 20th, looked at 01:20 on the 21st.
		expect(awaitingNewDay(daily('2026-08-20T21:00:00Z'), new Date('2026-08-20T23:20:00Z'))).toBe(
			true
		);
		// And still at 07:00 — two states only, by design.
		expect(awaitingNewDay(daily('2026-08-20T21:00:00Z'), new Date('2026-08-21T05:00:00Z'))).toBe(
			true
		);
	});

	it('is false while it is still the same Stockholm day', () => {
		// 20:00, looked at 23:00: overdue perhaps, but the day is not over.
		expect(awaitingNewDay(daily('2026-08-20T18:00:00Z'), new Date('2026-08-20T21:00:00Z'))).toBe(
			false
		);
	});

	// A nail trim is not "done for the day"; the rule belongs to daily types.
	it('is false for a type measured in days', () => {
		const nails = row({ interval_type: 'days', interval: 42, last_at: '2026-08-01T10:00:00Z' });
		expect(awaitingNewDay(nails, new Date('2026-08-20T10:00:00Z'))).toBe(false);
	});

	it('is false when nothing has been logged yet', () => {
		expect(awaitingNewDay(daily(null), new Date('2026-08-20T10:00:00Z'))).toBe(false);
	});
});

describe('intervalFormat', () => {
	it('writes a fixed interval in its own unit', () => {
		expect(intervalText(row({ interval_type: 'days', interval: 42 }))).toBe('var 42:e dag');
		expect(intervalText(row({ interval_type: 'hours', interval: 4 }))).toBe('var 4:e timme');
	});

	// The average is not stored; it is the gap the view already added to last_at.
	it('reads the average back out of the two ends the view gives', () => {
		const walk = row({
			interval_type: 'average',
			last_at: '2026-08-27T08:00:00Z',
			due_at: '2026-08-27T10:20:00Z'
		});
		expect(intervalText(walk)).toBe('snitt 2,3 tim');
	});

	it('is null when there is nothing to say', () => {
		expect(intervalText(row({ interval_type: 'days', interval: null }))).toBeNull();
		// Average mode with no average yet: the badge explains, the detail stays quiet.
		expect(
			intervalText(row({ interval_type: 'average', last_at: '2026-08-27T08:00:00Z' }))
		).toBeNull();
	});
});
