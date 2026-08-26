// A failed read must not look like an empty database. The list helpers return
// null for a failure, which is what lets a page say "could not be read"
// instead of "nothing logged yet" — and what keeps the service worker from
// storing that page as the good copy.

import { describe, expect, it } from 'vitest';
import { monthEvents, recentEvents } from '$lib/server/events';
import type { Db } from '$lib/server/db';

/** A query builder that answers whatever the test hands it. */
function fakeDb(result: { data: unknown; error: unknown }): Db {
	const builder: Record<string, unknown> = {};
	for (const method of ['from', 'select', 'order', 'limit', 'gte', 'lt']) {
		builder[method] = () => builder;
	}
	builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
	return builder as unknown as Db;
}

const row = {
	id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
	type_id: 'walk',
	occurred_at: '2026-08-26T10:00:00.000Z',
	note: null,
	details: null,
	type: { label: 'Promenad', icon: '🚶' }
};

const failure = { data: null, error: { code: 'PGRST301', message: 'JWT expired' } };

describe('recentEvents', () => {
	it('reports a failed read as null, not as an empty list', async () => {
		expect(await recentEvents(fakeDb(failure))).toBeNull();
	});

	it('still returns an empty list when there is genuinely nothing', async () => {
		expect(await recentEvents(fakeDb({ data: [], error: null }))).toEqual([]);
	});

	it('defaults absent details to an object, so the summary can read them', async () => {
		const events = await recentEvents(fakeDb({ data: [row], error: null }));
		expect(events?.[0].details).toEqual({});
	});
});

describe('monthEvents', () => {
	it('reports a failed read as null', async () => {
		expect(await monthEvents(fakeDb(failure), 'a', 'b')).toBeNull();
	});

	it('returns an empty month as an empty list', async () => {
		expect(await monthEvents(fakeDb({ data: [], error: null }), 'a', 'b')).toEqual([]);
	});
});
