import { describe, expect, it } from 'vitest';
import * as time from '$lib/time';

describe('stockholmInputToUtc', () => {
	it('converts summer time (CEST, +2)', () => {
		expect(time.stockholmInputToUtc('2026-07-01T12:00')?.toISOString()).toBe(
			'2026-07-01T10:00:00.000Z'
		);
	});

	it('converts winter time (CET, +1)', () => {
		expect(time.stockholmInputToUtc('2026-01-15T12:00')?.toISOString()).toBe(
			'2026-01-15T11:00:00.000Z'
		);
	});

	it('handles both sides of the spring-forward switch', () => {
		// 2026-03-29: clocks jump 02:00 → 03:00.
		expect(time.stockholmInputToUtc('2026-03-29T01:30')?.toISOString()).toBe(
			'2026-03-29T00:30:00.000Z'
		);
		expect(time.stockholmInputToUtc('2026-03-29T03:30')?.toISOString()).toBe(
			'2026-03-29T01:30:00.000Z'
		);
	});

	it('handles both sides of the fall-back switch', () => {
		// 2026-10-25: clocks fall 03:00 → 02:00.
		expect(time.stockholmInputToUtc('2026-10-25T01:00')?.toISOString()).toBe(
			'2026-10-24T23:00:00.000Z'
		);
		expect(time.stockholmInputToUtc('2026-10-25T04:00')?.toISOString()).toBe(
			'2026-10-25T03:00:00.000Z'
		);
	});

	it('rejects malformed values', () => {
		expect(time.stockholmInputToUtc('')).toBeNull();
		expect(time.stockholmInputToUtc('not-a-date')).toBeNull();
		expect(time.stockholmInputToUtc('2026-13-99T12:00')).toBeNull();
	});
});

describe('calendar arithmetic', () => {
	it('addDays moves across month and year boundaries', () => {
		expect(time.addDays('2026-08-14', -3)).toBe('2026-08-11');
		expect(time.addDays('2026-01-01', -1)).toBe('2025-12-31');
		expect(time.addDays('2026-02-28', 1)).toBe('2026-03-01');
	});

	it('addMonths snaps to the 1st', () => {
		expect(time.addMonths('2026-08-14', -1)).toBe('2026-07-01');
		expect(time.addMonths('2026-01-15', -2)).toBe('2025-11-01');
	});

	it('mondayOf finds the week start from any weekday', () => {
		expect(time.mondayOf('2026-08-14')).toBe('2026-08-10'); // Friday
		expect(time.mondayOf('2026-08-10')).toBe('2026-08-10'); // Monday itself
		expect(time.mondayOf('2026-08-16')).toBe('2026-08-10'); // Sunday
	});

	it('isoWeek matches the Swedish week numbering, across the year turn', () => {
		expect(time.isoWeek('2026-08-14')).toBe(33);
		expect(time.isoWeek('2026-01-01')).toBe(1); // a Thursday, so week 1
		expect(time.isoWeek('2025-12-29')).toBe(1); // Monday of that same week
	});

	it('lastDays lists the run ending on the given day, oldest first', () => {
		expect(time.lastDays('2026-08-14', 3)).toEqual(['2026-08-12', '2026-08-13', '2026-08-14']);
		expect(time.lastDays('2026-08-14', 30)).toHaveLength(30);
	});
});
