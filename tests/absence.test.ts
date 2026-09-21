// An absence: the one event with an end. The end is parsed here for the queue
// and the server alike, and the list wording is pinned so it cannot drift.

import { describe, expect, it } from 'vitest';
import { absenceText, isAbsence, parseEnd } from '$lib/events/absence';
import * as locale from '$lib/locale';
import { parseEventForm } from '$lib/server/events';
import { daysAwayText } from '$lib/stats/summary';
import type { StatSummary } from '$lib/types/domain';

function form(entries: Record<string, string>): FormData {
	const data = new FormData();
	for (const [name, value] of Object.entries(entries)) {
		data.append(name, value);
	}
	return data;
}

// 08:15 Stockholm on a September day, CEST.
const start = new Date('2026-09-21T06:15:00Z');

describe('isAbsence', () => {
	it('is true for the absence category alone', () => {
		expect(isAbsence('absence')).toBe(true);
		expect(isAbsence('routine')).toBe(false);
		// A row whose catalogue join came back empty spans nothing.
		expect(isAbsence(null)).toBe(false);
		expect(isAbsence(undefined)).toBe(false);
	});
});

describe('parseEnd', () => {
	it('reads an empty field as "still away", not as an error', () => {
		expect(parseEnd(form({ ended_at: '' }), start)).toEqual({ ok: true, ended: null });
		expect(parseEnd(form({}), start)).toEqual({ ok: true, ended: null });
	});

	it('reads the end as Stockholm wall-clock', () => {
		expect(parseEnd(form({ ended_at: '2026-09-21T16:30' }), start)).toEqual({
			ok: true,
			ended: new Date('2026-09-21T14:30:00Z')
		});
	});

	it('refuses an end at or before the start, in Swedish', () => {
		for (const ended_at of ['2026-09-21T08:15', '2026-09-21T07:00']) {
			expect(parseEnd(form({ ended_at }), start)).toEqual({
				ok: false,
				message: locale.errors.endBeforeStart
			});
		}
	});

	it('refuses a malformed end the same way a malformed start is refused', () => {
		expect(parseEnd(form({ ended_at: 'ikväll' }), start)).toEqual({
			ok: false,
			message: locale.errors.invalidTime
		});
	});
});

describe('parseEventForm with an end', () => {
	const base = { type_id: 'away', occurred_at: '2026-09-21T08:15', detailed: '1' };

	it('stores the end beside the start', () => {
		const parsed = parseEventForm(form({ ...base, ended_at: '2026-09-21T16:30' }), 'dog-1');
		expect(parsed).toEqual({
			ok: true,
			row: {
				dog_id: 'dog-1',
				type_id: 'away',
				occurred_at: '2026-09-21T06:15:00.000Z',
				ended_at: '2026-09-21T14:30:00.000Z'
			}
		});
	});

	it('leaves the column alone when the field is empty, so the row is open', () => {
		const parsed = parseEventForm(form({ ...base, ended_at: '' }), 'dog-1');
		expect(parsed.ok && 'ended_at' in parsed.row).toBe(false);
	});

	it('refuses an end before the start before anything is stored', () => {
		expect(parseEventForm(form({ ...base, ended_at: '2026-09-21T07:00' }), 'dog-1')).toEqual({
			ok: false,
			message: locale.errors.endBeforeStart
		});
	});
});

describe('absenceText', () => {
	it('says only that it is going on while there is no end — no clock involved', () => {
		expect(absenceText({ occurred_at: start.toISOString(), ended_at: null })).toBe('pågår');
	});

	it('gives the length and the time she was back', () => {
		const text = absenceText({
			occurred_at: start.toISOString(),
			ended_at: '2026-09-21T14:30:00Z'
		});
		// The weekday and month come from Intl; the shape is what is pinned.
		expect(text).toMatch(/^8 timmar · hemma .+ 16:30$/);
	});

	it('rounds a long stay to days, as the rest of the app words durations', () => {
		const text = absenceText({
			occurred_at: start.toISOString(),
			ended_at: '2026-09-23T15:00:00Z'
		});
		expect(text.startsWith('2 dagar · hemma')).toBe(true);
	});
});

describe('daysAwayText', () => {
	const summary = (away_days: number): StatSummary => ({
		dog_id: 'dog-1',
		walks_per_day: 0,
		avg_walk_gap_min: null,
		avg_walk_duration_min: null,
		avg_meal_gap_min: null,
		meal_finish_rate: null,
		accidents_per_day: 0,
		accidents_per_week: 0,
		accidents_per_month: 0,
		days_counted: 30,
		away_days
	});

	it('writes the days away with one Swedish decimal', () => {
		expect(daysAwayText(summary(0.3333))).toBe('0,3');
		expect(daysAwayText(summary(2))).toBe('2');
	});

	// Below a twentieth of a day the sentence would say "0 dagar borta".
	it('is null when there is nothing worth a decimal, and with no summary', () => {
		expect(daysAwayText(summary(0.02))).toBeNull();
		expect(daysAwayText(summary(0))).toBeNull();
		expect(daysAwayText(null)).toBeNull();
	});
});
