// When Status turns into a notification (plan 19). The rules run in the Edge
// Function, so a wrong one is a phone buzzing at the wrong time with nothing
// on screen to explain it, which is why each rule gets its own case.

import { describe, expect, it } from 'vitest';
import * as schedule from '$lib/status/schedule';
import type { StatusRow } from '$lib/types/domain';
import {
	DAILY_AMBER_MS,
	RECURRING_AMBER_MS,
	awaitingNewDay,
	reminderDue,
	reminderMessage,
	type ReminderRow
} from '../supabase/functions/_shared/reminders.ts';

const walk = (part: Partial<ReminderRow> = {}): ReminderRow => ({
	type_id: 'walk',
	label: 'Promenad',
	icon: '🚶',
	interval: null,
	interval_type: 'average',
	// 13:05 Stockholm, due 17:05 Stockholm
	last_at: '2026-09-15T11:05:00Z',
	due_at: '2026-09-15T15:05:00Z',
	due_from: null,
	...part
});

const nailTrim = (part: Partial<ReminderRow> = {}): ReminderRow => ({
	type_id: 'nail_trim',
	label: 'Kloklippning',
	icon: '💅',
	interval: 42,
	interval_type: 'days',
	// 20 aug 15:00 Stockholm, due 1 oct 15:00 Stockholm
	last_at: '2026-08-20T13:00:00Z',
	due_at: '2026-10-01T13:00:00Z',
	due_from: null,
	...part
});

const at = (iso: string) => new Date(iso);

describe('reminderDue, daily', () => {
	it('fires once the card turns amber, 30 minutes before due', () => {
		expect(reminderDue(walk(), false, at('2026-09-15T14:35:00Z'))).toBe('soon');
		expect(reminderDue(walk(), false, at('2026-09-15T15:04:00Z'))).toBe('soon');
	});

	it('is quiet while the card is still green', () => {
		expect(reminderDue(walk(), false, at('2026-09-15T14:34:00Z'))).toBeNull();
	});

	// Red is on screen already; the heads-up is the only daily notification.
	it('stops at due', () => {
		expect(reminderDue(walk(), false, at('2026-09-15T15:05:00Z'))).toBeNull();
	});

	it('pauses while she is with the sitter', () => {
		expect(reminderDue(walk(), true, at('2026-09-15T14:40:00Z'))).toBeNull();
	});

	// Skipped, not postponed: nothing waits until 07:00.
	it('stays silent from 22:00 to 07:00 Stockholm', () => {
		const late = walk({ due_at: '2026-09-15T20:20:00Z' }); // 22:20
		expect(reminderDue(late, false, at('2026-09-15T19:59:00Z'))).toBe('soon'); // 21:59
		expect(reminderDue(late, false, at('2026-09-15T20:00:00Z'))).toBeNull(); // 22:00

		const early = walk({
			last_at: '2026-09-15T04:00:00Z',
			due_at: '2026-09-15T05:10:00Z' // 07:10
		});
		expect(reminderDue(early, false, at('2026-09-15T04:50:00Z'))).toBeNull(); // 06:50
		expect(reminderDue(early, false, at('2026-09-15T05:00:00Z'))).toBe('soon'); // 07:00
	});

	// "väntar på ny dag": last walk yesterday evening, due this morning.
	it('says nothing once the day has turned', () => {
		const overnight = walk({
			last_at: '2026-09-14T18:00:00Z', // 20:00
			due_at: '2026-09-15T06:00:00Z' // 08:00
		});
		expect(reminderDue(overnight, false, at('2026-09-15T05:40:00Z'))).toBeNull();
	});

	// After an absence the schedule counts from the return, not the last walk.
	it('counts the new day from the return when there is one', () => {
		const back = walk({
			last_at: '2026-09-14T18:00:00Z',
			due_from: '2026-09-15T08:00:00Z',
			due_at: '2026-09-15T12:00:00Z'
		});
		expect(reminderDue(back, false, at('2026-09-15T11:40:00Z'))).toBe('soon');
	});

	it('needs a due time: never logged, or no average yet', () => {
		expect(reminderDue(walk({ due_at: null }), false, at('2026-09-15T14:40:00Z'))).toBeNull();
	});

	it('ignores hours mode with no number', () => {
		const unset = walk({ interval_type: 'hours', interval: null });
		expect(reminderDue(unset, false, at('2026-09-15T14:40:00Z'))).toBeNull();
	});
});

describe('reminderDue, recurring', () => {
	// 1 oct is the due day, so the week-ahead morning is 24 sep, 09:00 CEST.
	it('fires a week ahead from 09:00 Stockholm', () => {
		expect(reminderDue(nailTrim(), false, at('2026-09-24T06:59:00Z'))).toBeNull();
		expect(reminderDue(nailTrim(), false, at('2026-09-24T07:00:00Z'))).toBe('week');
	});

	// The window runs until the due morning; the claim is what stops repeats.
	it('keeps the week-ahead window open until the due morning', () => {
		expect(reminderDue(nailTrim(), false, at('2026-09-28T10:00:00Z'))).toBe('week');
		expect(reminderDue(nailTrim(), false, at('2026-10-01T06:59:00Z'))).toBeNull();
	});

	// Due at 15:00 that day, and "idag" from 09:00, while the pill is still amber.
	it('fires on the due day from 09:00', () => {
		expect(reminderDue(nailTrim(), false, at('2026-10-01T07:00:00Z'))).toBe('due');
	});

	// Already overdue when first seen: one "idag" at the next daytime run.
	it('catches up on a due day that has passed', () => {
		expect(reminderDue(nailTrim(), false, at('2026-10-05T10:00:00Z'))).toBe('due');
	});

	it('only sends between 09:00 and 22:00', () => {
		expect(reminderDue(nailTrim(), false, at('2026-10-05T20:30:00Z'))).toBeNull(); // 22:30
		expect(reminderDue(nailTrim(), false, at('2026-10-05T06:30:00Z'))).toBeNull(); // 08:30
	});

	// Grooming does not wait for the dog to come home.
	it('is not paused by an absence', () => {
		expect(reminderDue(nailTrim(), true, at('2026-10-01T07:00:00Z'))).toBe('due');
	});

	// A week-ahead morning before the last trim would fire the moment it was logged.
	it('skips the week ahead on a schedule shorter than a week', () => {
		const short = nailTrim({
			interval: 3,
			last_at: '2026-09-28T13:00:00Z',
			due_at: '2026-10-01T13:00:00Z'
		});
		expect(reminderDue(short, false, at('2026-09-28T14:00:00Z'))).toBeNull();
		expect(reminderDue(short, false, at('2026-10-01T07:00:00Z'))).toBe('due');
	});

	it('ignores a type with no interval', () => {
		const vet = nailTrim({ interval: null, due_at: null });
		expect(reminderDue(vet, false, at('2026-10-01T07:00:00Z'))).toBeNull();
	});

	// Summer time ends 25 oct 2026: 09:00 is 07:00Z the week before, 08:00Z on the day.
	it('keeps 09:00 Stockholm across the DST switch', () => {
		const late = nailTrim({ last_at: '2026-09-13T12:00:00Z', due_at: '2026-10-25T12:00:00Z' });
		expect(reminderDue(late, false, at('2026-10-18T06:59:00Z'))).toBeNull();
		expect(reminderDue(late, false, at('2026-10-18T07:00:00Z'))).toBe('week');
		expect(reminderDue(late, false, at('2026-10-25T07:59:00Z'))).toBeNull(); // 08:59 CET
		expect(reminderDue(late, false, at('2026-10-25T08:00:00Z'))).toBe('due');
	});
});

describe('reminderMessage', () => {
	it('words the daily heads-up', () => {
		expect(reminderMessage(walk(), 'soon')).toEqual({
			title: '🚶 Promenad om 30 min',
			body: 'Senast kl. 13:05'
		});
	});

	it('words the week ahead and the due day', () => {
		expect(reminderMessage(nailTrim(), 'week')).toEqual({
			title: '💅 Kloklippning om en vecka',
			body: 'Senast 20 aug.'
		});
		expect(reminderMessage(nailTrim(), 'due')).toEqual({
			title: '💅 Kloklippning idag',
			body: 'Senast 20 aug. · var 42:e dag'
		});
	});
});

// The function cannot import $lib, so it repeats two rules. These pin them.
describe('parity with $lib/status/schedule', () => {
	it('turns amber at the same moments', () => {
		expect(DAILY_AMBER_MS).toBe(schedule.DAILY_AMBER_MS);
		expect(RECURRING_AMBER_MS).toBe(schedule.RECURRING_AMBER_MS);
	});

	it('agrees on awaitingNewDay', () => {
		const rows = [
			walk(),
			walk({ last_at: '2026-09-14T21:59:00Z' }), // 23:59 the day before
			walk({ last_at: '2026-09-14T22:00:00Z' }), // 00:00 the same day
			walk({ due_from: '2026-09-15T08:00:00Z', last_at: '2026-09-13T08:00:00Z' }),
			walk({ last_at: null }),
			nailTrim()
		];
		const nows = ['2026-09-15T05:00:00Z', '2026-09-15T21:59:00Z', '2026-09-15T22:00:00Z'];
		for (const row of rows) {
			for (const now of nows) {
				const status = { ...row, dog_id: 'dog-1', category: 'routine', sort_order: 0 };
				expect(awaitingNewDay(row, at(now))).toBe(
					schedule.awaitingNewDay(status as StatusRow, at(now))
				);
			}
		}
	});
});
