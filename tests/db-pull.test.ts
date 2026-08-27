// The wrapping that turns a production dump into something the local database
// will actually load. Each assertion here stands for one way the raw dump fails
// to load, so a future edit cannot quietly drop a fix and still look right.

import { describe, expect, it } from 'vitest';
import { buildSnapshot } from '../scripts/db-pull-core.ts';

const DUMP = `COPY public.households (id, name) FROM stdin;
aaaa	Hemma
\\.
COPY public.events (id, created_by) FROM stdin;
bbbb	cccc
\\.`;

describe('buildSnapshot', () => {
	const sql = buildSnapshot(DUMP, 'dev@local');

	it('keeps the dump intact', () => {
		expect(sql).toContain('COPY public.households');
		expect(sql).toContain('COPY public.events');
		expect(sql).toContain('aaaa\tHemma');
	});

	// The dump references production's user ids, which do not exist locally, and
	// two tables have foreign keys into auth.users. Without this the load fails
	// on the first household_members row.
	it('silences foreign keys for the load, and restores them after', () => {
		expect(sql).toContain('set session_replication_role = replica;');
		expect(sql.trimEnd().endsWith('set session_replication_role = origin;')).toBe(true);
	});

	// seed.sql runs first and inserts its own household and dog; left in place
	// they sit beside production's and the app shows the wrong dog.
	it('clears the seeded household before loading production’s', () => {
		const truncate = sql.indexOf('truncate events, dogs, household_members, households cascade;');
		expect(truncate).toBeGreaterThan(-1);
		expect(truncate).toBeLessThan(sql.indexOf('COPY public.households'));
	});

	// Rebuilt rather than updated: two members of one household would both
	// become the single local user and collide on the primary key.
	it('rebuilds membership onto the local login, after the data is in', () => {
		const rebuild = sql.indexOf('delete from household_members;');
		expect(rebuild).toBeGreaterThan(sql.indexOf('COPY public.events'));
		expect(sql).toContain("where u.email = 'dev@local'");
	});

	it('re-points every event at the local login, so no author dangles', () => {
		expect(sql).toContain(
			"update events set created_by = (select id from auth.users where email = 'dev@local');"
		);
	});

	// Keyed on the email so that no uuid is repeated between here and seed.sql,
	// where changing one and not the other would leave a snapshot that loads and
	// then shows nothing.
	it('names the login only by email, never by id', () => {
		expect(buildSnapshot(DUMP, 'someone@else')).toContain("'someone@else'");
		expect(sql).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-/);
	});
});
