// Ensamtid's chart and tiles (plan 22): the per-day split and the two numbers
// it is read for, the share calm and the longest calm stretch.

import { describe, expect, it } from 'vitest';
import { answeredShare, longestWhen, outcomeDays } from '$lib/stats/outcomes';

const row = (occurred_at: string, details: Record<string, unknown>) => ({
	occurred_at,
	details: details as Record<string, number | boolean>
});

const rows = [
	row('2026-09-10T08:00:00Z', { duration_min: 30, calm: true }),
	row('2026-09-10T15:00:00Z', { duration_min: 60, calm: false, anxious_after_min: 25 }),
	row('2026-09-10T18:00:00Z', { duration_min: 90 }),
	// 23:30 UTC is the next day in Stockholm.
	row('2026-09-10T23:30:00Z', { duration_min: 45, calm: true })
];

describe('outcomeDays', () => {
	it('splits each Stockholm day into calm, anxious and the rest', () => {
		expect(outcomeDays(rows, 'calm')).toEqual([
			{ day: '2026-09-10', n: 3, yes: 1, no: 1 },
			{ day: '2026-09-11', n: 1, yes: 1, no: 0 }
		]);
	});
});

describe('answeredShare', () => {
	// Two calm of three answered; the Vet ej one neither helps nor hurts.
	it('divides by the answered ones only', () => {
		expect(answeredShare(outcomeDays(rows, 'calm'))).toBeCloseTo(2 / 3);
	});

	it('is null with nothing answered', () => {
		expect(answeredShare([{ day: '2026-09-10', n: 2, yes: 0, no: 0 }])).toBeNull();
	});
});

describe('longestWhen', () => {
	// 60 and 90 are longer, but she was anxious through one and nobody knows about the other.
	it('takes the longest alone time she was calm through', () => {
		expect(longestWhen(rows, 'duration_min', 'calm')).toBe(45);
	});

	it('is null when she was never known to be calm', () => {
		expect(longestWhen([rows[1], rows[2]], 'duration_min', 'calm')).toBeNull();
	});
});
