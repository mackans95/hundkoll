// Locks the events-list summary line to its current wording, so the
// declarative summarize path in DETAIL_FIELDS cannot drift silently.

import { describe, expect, it } from 'vitest';
import { detailSummary } from '$lib/events/summary';

describe('detailSummary', () => {
	it('joins a walk’s duration and counts with the separator', () => {
		expect(detailSummary('walk', { duration_min: 35, pee: 3, poop: 1 })).toBe(
			'35 min · kiss ×3 · bajs'
		);
	});

	it('hides zero counts entirely', () => {
		expect(detailSummary('walk', { pee: 0, poop: 0 })).toBe('');
	});

	it('reads legacy boolean counts as one, without the ×', () => {
		expect(detailSummary('accident', { pee: true })).toBe('kiss');
	});

	it('words a meal both ways, and stays quiet when it was not judged', () => {
		expect(detailSummary('meal', { finished: true })).toBe('åt upp');
		expect(detailSummary('meal', { finished: false })).toBe('åt inte upp');
		expect(detailSummary('meal', {})).toBe('');
	});

	it('still renders legacy portion_g rows, portion first', () => {
		expect(detailSummary('meal', { portion_g: 120, finished: true })).toBe('120 g · åt upp');
	});

	it('writes weight with a Swedish decimal comma', () => {
		expect(detailSummary('weight', { kg: 12.4 })).toBe('12,4 kg');
	});

	it('says nothing for types without declared fields', () => {
		expect(detailSummary('bath', {})).toBe('');
		expect(detailSummary('unknown_type', { anything: 1 })).toBe('');
	});
});
