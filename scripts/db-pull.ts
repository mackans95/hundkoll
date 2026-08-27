// `npm run db-pull` — copies production's data into the local database, so the
// events list has content and every stats card draws real bars. Reviewing a new
// chart against an empty state is guesswork; this is the fix.
//
// The one production operation in the whole local-database workflow is the read
// below. Nothing here writes to production.

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildSnapshot } from './db-pull-core.ts';

const ROOT = new URL('..', import.meta.url).pathname;
const SNAPSHOT = 'supabase/seeds/prod-snapshot.sql';
/** Matches the login in supabase/seed.sql, which runs before this file. */
const LOCAL_LOGIN = 'dev@local';

// Real data about a real dog. A snapshot git can see is a snapshot that can be
// pushed, so this checks the path rather than trusting it.
try {
	execFileSync('git', ['check-ignore', '-q', SNAPSHOT], { cwd: ROOT });
} catch {
	console.error(`✖ ${SNAPSHOT} is not gitignored — refusing to write production data there.`);
	process.exit(1);
}

const dumpFile = join(tmpdir(), 'hundkoll-prod-data.sql');

// event_types is excluded because the migrations already insert those rows: a
// dumped copy collides on the primary key. The password comes from the
// environment when it is set and the CLI prompts for it when it is not — hence
// the inherited stdio.
console.log('reading production (read-only)…');
execFileSync(
	'supabase',
	[
		'db',
		'dump',
		'--linked',
		'--data-only',
		'-s',
		'public',
		'-x',
		'public.event_types',
		'-f',
		dumpFile,
		...(process.env.SUPABASE_DB_PASSWORD ? ['-p', process.env.SUPABASE_DB_PASSWORD] : [])
	],
	{ cwd: ROOT, stdio: 'inherit' }
);

const dump = readFileSync(dumpFile, 'utf8');
rmSync(dumpFile, { force: true });

mkdirSync(join(ROOT, 'supabase/seeds'), { recursive: true });
writeFileSync(join(ROOT, SNAPSHOT), buildSnapshot(dump, LOCAL_LOGIN));
console.log(`wrote ${SNAPSHOT}`);

// Seeds only run on a reset, so the snapshot is inert until one happens. Doing
// it here means the command does what it says, rather than leaving a file that
// looks applied and is not — the same confusion an unapplied migration caused.
console.log('loading it into the local database…');
execFileSync('supabase', ['db', 'reset'], { cwd: ROOT, stdio: 'inherit' });

console.log(`
The local database now holds production's history, logged in as ${LOCAL_LOGIN}.
It is a snapshot, not a connection: logging something here changes nothing
anywhere else, and re-running this command refreshes it.
`);
