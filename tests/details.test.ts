import { describe, expect, it } from 'vitest';
import { parseDetails } from '$lib/events/details';
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
			field: locale.activities.fields.durationMin
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
