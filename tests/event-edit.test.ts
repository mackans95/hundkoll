// Editing a stored event: what the patch contains, and what it must never
// destroy. The type comes from the stored row, never from the form.

import { describe, expect, it } from 'vitest';
import { parseEventEdit } from '$lib/server/events';
import * as locale from '$lib/locale';
import type { EventRow } from '$lib/types/domain';

function form(entries: Record<string, string>): FormData {
	const data = new FormData();
	for (const [name, value] of Object.entries(entries)) {
		data.append(name, value);
	}
	return data;
}

const walk: EventRow = {
	id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
	type_id: 'walk',
	occurred_at: '2026-08-20T10:00:00.000Z',
	details: { duration_min: 35, pee: 2, poop: 1 },
	note: 'regn',
	type: { label: 'Promenad', icon: '🐾' }
};

describe('parseEventEdit', () => {
	it('reads the time as Stockholm wall-clock and the fields as the type declares', () => {
		const parsed = parseEventEdit(
			form({ occurred_at: '2026-08-20T14:30', duration_min: '40', pee: '3', poop: '0' }),
			walk
		);

		expect(parsed).toEqual({
			ok: true,
			patch: {
				occurred_at: '2026-08-20T12:30:00.000Z',
				details: { duration_min: 40, pee: 3, poop: 0 },
				note: null
			}
		});
	});

	it('keeps details the form never showed, instead of destroying them', () => {
		const meal: EventRow = {
			...walk,
			type_id: 'meal',
			details: { portion_g: 120, finished: true }
		};
		const parsed = parseEventEdit(form({ occurred_at: '2026-08-20T14:30' }), meal);

		// portion_g is no longer collected, so an edit form cannot show it —
		// and must not silently drop it either. finished is a checkbox, so an
		// absent one is a real false.
		expect(parsed.ok && parsed.patch.details).toEqual({ portion_g: 120, finished: false });
	});

	it('clears a note that was emptied, and trims one that was not', () => {
		const cleared = parseEventEdit(form({ occurred_at: '2026-08-20T14:30', note: '   ' }), walk);
		expect(cleared.ok && cleared.patch.note).toBeNull();

		const kept = parseEventEdit(form({ occurred_at: '2026-08-20T14:30', note: '  sol  ' }), walk);
		expect(kept.ok && kept.patch.note).toBe('sol');
	});

	it('refuses a missing or malformed time rather than guessing one', () => {
		const shapes: Record<string, string>[] = [{}, { occurred_at: '' }, { occurred_at: 'imorgon' }];
		for (const entries of shapes) {
			expect(parseEventEdit(form(entries), walk)).toEqual({
				ok: false,
				message: locale.errors.invalidTime
			});
		}
	});

	it('reports the offending field for a value that is not a number', () => {
		expect(
			parseEventEdit(form({ occurred_at: '2026-08-20T14:30', duration_min: 'abc' }), walk)
		).toEqual({
			ok: false,
			message: locale.errors.invalidValue(locale.activities.fields.durationMin)
		});
	});

	// Rows logged before the dialog had a time field carry real seconds, from
	// the column's now() default. Editing anything else must not spend them.
	it('keeps the stored seconds when the minute was not touched', () => {
		const seconds: EventRow = { ...walk, occurred_at: '2026-08-20T10:00:37.412Z' };
		const parsed = parseEventEdit(form({ occurred_at: '2026-08-20T12:00', note: 'sol' }), seconds);

		expect(parsed.ok && parsed.patch.occurred_at).toBe('2026-08-20T10:00:37.412Z');
	});

	it('snaps to :00 when the minute really did change', () => {
		const seconds: EventRow = { ...walk, occurred_at: '2026-08-20T10:00:37.412Z' };
		const parsed = parseEventEdit(form({ occurred_at: '2026-08-20T12:05' }), seconds);

		expect(parsed.ok && parsed.patch.occurred_at).toBe('2026-08-20T10:05:00.000Z');
	});

	it('ignores a type_id in the form: an edit cannot change the activity', () => {
		const parsed = parseEventEdit(
			form({ occurred_at: '2026-08-20T14:30', type_id: 'weight', kg: '12.4' }),
			walk
		);

		// Parsed against walk's fields, so kg is not collected at all.
		expect(parsed.ok && parsed.patch.details).toEqual({
			duration_min: 35,
			pee: 0,
			poop: 0
		});
	});
});
