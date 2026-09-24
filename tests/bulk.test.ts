// Logga flera: several rows in one form, each read by the dialog's own parser
// once its prefix is gone. What is pinned here is that a row reads exactly as
// a dialog post would, and that a bad row names itself.

import { describe, expect, it } from 'vitest';
import { foldedText, rowFields, rowName, splitRows } from '$lib/events/bulk';
import * as locale from '$lib/locale';
import { parseBulkForm, parseEventForm } from '$lib/server/events';

function form(entries: Record<string, string>): FormData {
	const data = new FormData();
	for (const [name, value] of Object.entries(entries)) {
		data.append(name, value);
	}
	return data;
}

const entries = (data: FormData) => Object.fromEntries(data.entries());

describe('splitRows', () => {
	it('groups by prefix, strips it, and composes the day into occurred_at', () => {
		const rows = splitRows(
			form({
				r0_type_id: 'walk',
				r0_time: '07:30',
				r0_pee: '1',
				r1_type_id: 'meal',
				r1_time: '08:00',
				r1_finished: 'on',
				day: '2026-08-14'
			}),
			'2026-08-14'
		);

		expect(rows.map((row) => row.number)).toEqual([1, 2]);
		expect(entries(rows[0].form)).toEqual({
			type_id: 'walk',
			time: '07:30',
			pee: '1',
			occurred_at: '2026-08-14T07:30',
			detailed: '1'
		});
		expect(entries(rows[1].form)).toMatchObject({ type_id: 'meal', finished: 'on' });
	});

	// The three starting slots are lines on the paper; an unused one is skipped
	// whatever else was left in it.
	it('skips a row with no time, and keeps the others’ numbers', () => {
		const rows = splitRows(
			form({
				r0_type_id: 'walk',
				r0_time: '',
				r0_pee: '2',
				r1_type_id: 'meal',
				r1_time: '  ',
				r2_type_id: 'walk',
				r2_time: '12:15'
			}),
			'2026-08-14'
		);

		expect(rows.map((row) => row.number)).toEqual([3]);
	});

	it('orders rows by their index whatever order the form posted them in', () => {
		const data = form({ r2_time: '12:00', r2_type_id: 'walk' });
		data.append('r0_time', '07:00');
		data.append('r0_type_id', 'meal');
		expect(splitRows(data, '2026-08-14').map((row) => row.number)).toEqual([1, 3]);
	});

	it('names fields the way the sheet does', () => {
		expect(rowName(2, 'pee')).toBe('r2_pee');
	});
});

describe('rowFields', () => {
	it('picks one row out of the form, prefix stripped', () => {
		const fields = rowFields(
			form({ r0_time: '07:00', r1_time: '11:20', r1_pee: '1', day: '2026-08-14' }),
			1
		);
		expect(entries(fields)).toEqual({ time: '11:20', pee: '1' });
	});

	it('is empty for a row the form does not have', () => {
		expect(entries(rowFields(form({ r0_time: '07:00' }), 4))).toEqual({});
	});
});

describe('foldedText', () => {
	const walk = { id: 'walk', label: 'Promenad', icon: '🚶' };

	it('reads type, time and details in the events list’s own words', () => {
		expect(foldedText(walk, form({ time: '11:20', duration_min: '10', pee: '1', poop: '0' }))).toBe(
			'🚶 Promenad · 11:20 · 10 min · kiss'
		);
	});

	it('leaves the details off when there are none to say', () => {
		expect(foldedText({ id: 'bath', label: 'Bad', icon: '🛁' }, form({ time: '18:00' }))).toBe(
			'🛁 Bad · 18:00'
		);
	});

	// A folded row with no time will be skipped on save; the header should say so.
	it('says when the time is missing', () => {
		expect(foldedText(walk, form({ time: '' }))).toBe('🚶 Promenad · ingen tid');
	});

	it('still folds a row whose details would not parse, without them', () => {
		expect(foldedText(walk, form({ time: '07:30', duration_min: 'tjugo' }))).toBe(
			'🚶 Promenad · 07:30'
		);
	});
});

describe('parseBulkForm', () => {
	const now = new Date('2026-08-15T10:00:00Z');

	// The whole point: no second parser. A walk row must come out identical to
	// the same fields posted from the dialog.
	it('reads a row exactly as the dialog would have', () => {
		const fromDialog = parseEventForm(
			form({
				type_id: 'walk',
				occurred_at: '2026-08-14T07:30',
				detailed: '1',
				duration_min: '20',
				pee: '1',
				poop: '1',
				note: 'kiss bajs',
				event_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
			}),
			'dog-1'
		);
		const bulk = parseBulkForm(
			form({
				day: '2026-08-14',
				r0_type_id: 'walk',
				r0_time: '07:30',
				r0_duration_min: '20',
				r0_pee: '1',
				r0_poop: '1',
				r0_note: 'kiss bajs',
				r0_event_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
			}),
			'dog-1',
			now
		);

		expect(fromDialog.ok && bulk.ok && bulk.rows).toEqual(fromDialog.ok && [fromDialog.row]);
		expect(bulk.ok && bulk.rows[0].occurred_at).toBe('2026-08-14T05:30:00.000Z');
	});

	it('returns every row that has a time, in order', () => {
		const bulk = parseBulkForm(
			form({
				day: '2026-08-14',
				r0_type_id: 'walk',
				r0_time: '07:30',
				r1_type_id: 'meal',
				r1_time: '',
				r2_type_id: 'meal',
				r2_time: '17:00',
				r2_finished: 'on'
			}),
			'dog-1',
			now
		);

		expect(bulk.ok && bulk.rows.map((row) => [row.type_id, row.occurred_at, row.details])).toEqual([
			['walk', '2026-08-14T05:30:00.000Z', { pee: 0, poop: 0 }],
			['meal', '2026-08-14T15:00:00.000Z', { finished: true }]
		]);
	});

	it('names the row that failed, with the dialog’s own message', () => {
		const bulk = parseBulkForm(
			form({
				day: '2026-08-14',
				r0_type_id: 'walk',
				r0_time: '07:30',
				r1_type_id: 'walk',
				r1_time: '12:15',
				r1_duration_min: 'tjugo'
			}),
			'dog-1',
			now
		);

		expect(bulk).toEqual({
			ok: false,
			message: locale.errors.bulkRow(
				2,
				locale.errors.invalidValue(locale.activities.fields.durationMin)
			)
		});
	});

	// The dialog stops this with max= on its date field; a clock field cannot.
	it('refuses a time that has not happened yet, by row', () => {
		const bulk = parseBulkForm(
			form({ day: '2026-08-15', r0_type_id: 'walk', r0_time: '12:30' }),
			'dog-1',
			now
		);
		expect(bulk).toEqual({
			ok: false,
			message: locale.errors.bulkRow(1, locale.errors.futureTime)
		});
	});

	it('refuses a form with no row worth saving, and a day that is not one', () => {
		expect(parseBulkForm(form({ day: '2026-08-14', r0_time: '' }), 'dog-1', now)).toEqual({
			ok: false,
			message: locale.errors.noRows
		});
		expect(parseBulkForm(form({ day: 'igår', r0_time: '07:00' }), 'dog-1', now)).toEqual({
			ok: false,
			message: locale.errors.invalidTime
		});
	});
});
