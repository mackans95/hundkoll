import { describe, expect, it } from 'vitest';
import { detailsMessage, parseDetails, parseFields } from '$lib/events/details';
import type { DetailField } from '$lib/events/fields';
import * as locale from '$lib/locale';

function form(entries: Record<string, string>): FormData {
	const data = new FormData();
	for (const [name, value] of Object.entries(entries)) {
		data.append(name, value);
	}
	return data;
}

describe('parseDetails', () => {
	it('reads a count posted directly as its number', () => {
		const parsed = parseDetails(form({ pee: '3', poop: '1' }), 'walk');
		expect(parsed).toEqual({ ok: true, details: { pee: 3, poop: 1 } });
	});

	it('defaults a count to zero when absent, blank, junk or negative', () => {
		const shapes: Record<string, string>[] = [{}, { pee: '' }, { pee: 'abc' }, { pee: '-2' }];
		for (const entries of shapes) {
			const parsed = parseDetails(form(entries), 'walk');
			expect(parsed.ok && parsed.details.pee).toBe(0);
		}
	});

	it('still reads the legacy checkbox + stepper shape (pre-deploy queued rows)', () => {
		const parsed = parseDetails(form({ pee: 'on', pee_count: '3' }), 'walk');
		expect(parsed).toEqual({ ok: true, details: { pee: 3, poop: 0 } });

		const bare = parseDetails(form({ pee: 'on' }), 'walk');
		expect(bare).toEqual({ ok: true, details: { pee: 1, poop: 0 } });
	});

	it('accepts a Swedish decimal comma in numbers', () => {
		const parsed = parseDetails(form({ duration_min: '7,5' }), 'walk');
		expect(parsed.ok && parsed.details.duration_min).toBe(7.5);

		const weight = parseDetails(form({ kg: '12,3' }), 'weight');
		expect(weight.ok && weight.details.kg).toBe(12.3);
	});

	it('reports the offending field for a value that is not a number', () => {
		expect(parseDetails(form({ duration_min: 'abc' }), 'walk')).toEqual({
			ok: false,
			field: locale.activities.fields.durationMin,
			reason: 'value'
		});
	});

	it('reads a plain checkbox as true or false', () => {
		const finished = parseDetails(form({ finished: 'on' }), 'meal');
		expect(finished.ok && finished.details.finished).toBe(true);

		const notFinished = parseDetails(form({}), 'meal');
		expect(notFinished.ok && notFinished.details.finished).toBe(false);
	});

	it('collects nothing for a type with no detail fields', () => {
		expect(parseDetails(form({ anything: '1' }), 'bath')).toEqual({ ok: true, details: {} });
	});
});

// A reveal is a checkbox that uncovers other fields and is not valid without
// one of them. No shipped type has one yet, so these go through parseFields
// with the list given directly rather than declaring a type nothing logs.
describe('parseFields with a reveal', () => {
	const FIELDS: DetailField[] = [
		{ name: 'duration_min', label: 'Längd', input: 'number' },
		{ name: 'accident', label: 'Olycka', input: 'reveal' },
		{ name: 'vomit', label: 'Spydde', input: 'checkbox', revealedBy: 'accident' },
		{ name: 'poop', label: 'Bajsade', input: 'count', revealedBy: 'accident' },
		{ name: 'minute', label: 'Minut', input: 'number', revealedBy: 'accident' }
	];

	it('stores no accident keys at all when the box was never ticked', () => {
		const parsed = parseFields(form({ duration_min: '45' }), FIELDS);
		expect(parsed).toEqual({ ok: true, details: { duration_min: 45 } });
	});

	// The one that makes this rule necessary: hiding a checkbox does not clear
	// it, and without JavaScript nothing does.
	it('drops a ticked cause whose reveal is not ticked', () => {
		const parsed = parseFields(form({ duration_min: '45', vomit: 'on', poop: '2' }), FIELDS);
		expect(parsed).toEqual({ ok: true, details: { duration_min: 45 } });
	});

	it('stores the reveal and only the causes that were answered', () => {
		const parsed = parseFields(form({ duration_min: '45', accident: 'on', vomit: 'on' }), FIELDS);
		expect(parsed).toEqual({
			ok: true,
			details: { duration_min: 45, accident: true, vomit: true }
		});
	});

	it('refuses a ticked reveal with nothing chosen', () => {
		expect(parseFields(form({ accident: 'on' }), FIELDS)).toEqual({
			ok: false,
			field: 'Olycka',
			reason: 'choice'
		});
		// An unpicked cause is not a choice, however explicitly it was posted.
		expect(parseFields(form({ accident: 'on', poop: '0' }), FIELDS)).toEqual({
			ok: false,
			field: 'Olycka',
			reason: 'choice'
		});
	});

	it('counts a revealed count above zero, and a revealed number with a value', () => {
		const counted = parseFields(form({ accident: 'on', poop: '2' }), FIELDS);
		expect(counted).toEqual({ ok: true, details: { accident: true, poop: 2 } });

		const numbered = parseFields(form({ accident: 'on', minute: '12' }), FIELDS);
		expect(numbered).toEqual({ ok: true, details: { accident: true, minute: 12 } });
	});

	// The departure from a plain checkbox is deliberate: meal.finished stores
	// false because "she did not finish" is an answer, while an unpicked cause
	// says nothing about anything.
	it('leaves an unpicked cause out rather than storing false', () => {
		const parsed = parseFields(form({ accident: 'on', vomit: 'on' }), FIELDS);
		expect(parsed.ok && 'poop' in parsed.details).toBe(false);
		expect(parsed.ok && 'minute' in parsed.details).toBe(false);
	});
});

describe('detailsMessage', () => {
	it('words the two failures differently', () => {
		expect(detailsMessage({ ok: false, field: 'Olycka', reason: 'choice' })).toBe(
			locale.errors.chooseOne('Olycka')
		);
		expect(detailsMessage({ ok: false, field: 'Längd', reason: 'value' })).toBe(
			locale.errors.invalidValue('Längd')
		);
	});
});
