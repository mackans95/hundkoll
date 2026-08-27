// `npm run new-event` — walks through the "adding an event type" recipe in
// README.md and writes every artifact: the migration, the DETAIL_FIELDS
// entry, the locale strings and (optionally) a stats card scaffold.
//
// Prompts for anything not given as a flag; --dry-run prints every planned
// write without touching a file. It never touches the database: the printed
// checklist ends with `npm run db-push` *after* the branch merges, because
// migrations never ship from unmerged branches.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { createInterface } from 'node:readline/promises';
import {
	existingTypeIds,
	generate,
	nextSortOrder,
	validateSpec,
	type EventSpec,
	type FieldInput,
	type FieldSpec,
	type StatsSpec
} from './new-event-core.ts';

const ROOT = new URL('..', import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, 'supabase/migrations');

const HELP = `npm run new-event -- [flags]

Flags (anything missing is prompted for):
  --label <Promenad>          Swedish name, the log-button label
  --id <walk>                 English snake_case id
  --icon <🐾>                 emoji for the tile
  --category <other>          routine | care | health | other (default other)
  --interval <days>           expected days between, empty/none for no schedule
  --sort-order <n>            grid position (default: after everything)
  --field "name=claw_len;label=Klolängd;input=number;step=0.1;unit=mm;required"
                              repeatable; input is number | checkbox | count | reveal
                              a reveal is a checkbox that uncovers the fields
                              carrying revealed-by=<its name>, and is not valid
                              until one of them is answered; declare it first
  --field "name=vomit;label=Spydde;input=checkbox;revealed-by=accident"
  --stats <none|counts|trend> stats card scaffold
  --trend-field <name>        trend only: which number field to plot
  --trend-unit <kg>           trend only: the unit on the chart's axis
  --dry-run                   print every planned write, write nothing
`;

/** One --field flag, parsed from its semicolon-separated key=value pairs. */
function parseFieldFlag(raw: string): FieldSpec {
	const parts = new Map<string, string>();
	for (const pair of raw.split(';')) {
		const eq = pair.indexOf('=');
		parts.set(
			eq === -1 ? pair.trim() : pair.slice(0, eq).trim(),
			eq === -1 ? '' : pair.slice(eq + 1).trim()
		);
	}
	return {
		name: parts.get('name') ?? '',
		label: parts.get('label') ?? '',
		input: (parts.get('input') ?? 'checkbox') as FieldInput,
		step: parts.get('step') || undefined,
		required: parts.has('required'),
		unit: parts.get('unit') || undefined,
		revealedBy: parts.get('revealed-by') || undefined
	};
}

const { values: flags } = parseArgs({
	options: {
		label: { type: 'string' },
		id: { type: 'string' },
		icon: { type: 'string' },
		category: { type: 'string' },
		interval: { type: 'string' },
		'sort-order': { type: 'string' },
		field: { type: 'string', multiple: true },
		stats: { type: 'string' },
		'trend-field': { type: 'string' },
		'trend-unit': { type: 'string' },
		'dry-run': { type: 'boolean' },
		help: { type: 'boolean' }
	}
});

if (flags.help) {
	console.log(HELP);
	process.exit(0);
}

const rl = createInterface({ input: process.stdin, output: process.stdout });

/** Asks unless the flag already answered, showing the default in brackets. */
async function ask(
	flagValue: string | undefined,
	question: string,
	fallback = ''
): Promise<string> {
	if (flagValue !== undefined) {
		return flagValue;
	}
	const suffix = fallback ? ` [${fallback}]` : '';
	const answer = (await rl.question(`${question}${suffix}: `)).trim();
	return answer || fallback;
}

const label = await ask(flags.label, 'Swedish name (the log-button label)');
const id = await ask(flags.id, 'English id (snake_case)');
const icon = await ask(flags.icon, 'Icon (emoji)');
const category = await ask(flags.category, 'Category (routine/care/health/other)', 'other');
const intervalRaw = await ask(flags.interval, 'Interval in days (empty for none)');

/**
 * One field, prompted for. Returns null on an empty name, which ends the loop.
 * `revealedBy` set means this is a field inside a reveal: it is indented, and
 * `reveal` is off the menu — one level only.
 */
async function askField(indent: string, revealedBy?: string): Promise<FieldSpec | null> {
	const prompt = revealedBy
		? `${indent}Revealed field name (english snake_case, empty when done): `
		: `${indent}Field name (english snake_case, empty when done): `;
	const name = (await rl.question(prompt)).trim();
	if (!name) {
		return null;
	}

	const inner = `${indent}  `;
	const label = (await rl.question(`${inner}Swedish label: `)).trim();
	const choices = revealedBy ? 'number/checkbox/count' : 'number/checkbox/count/reveal';
	const input = ((await rl.question(`${inner}Input (${choices}) [checkbox]: `)).trim() ||
		'checkbox') as FieldInput;

	const field: FieldSpec = { name, label, input, revealedBy };
	if (input === 'number') {
		field.unit = (await rl.question(`${inner}Unit for summaries (like 'min' or 'kg'): `)).trim();
		field.step =
			(await rl.question(`${inner}Step (empty for whole numbers): `)).trim() || undefined;
		field.required = (await rl.question(`${inner}Required? (y/N): `)).trim().toLowerCase() === 'y';
	}
	return field;
}

const fields: FieldSpec[] = (flags.field ?? []).map(parseFieldFlag);
if (flags.field === undefined) {
	console.log(`
Detail fields are the extra inputs inside the log dialog, beyond the time and
the note. Most types have none — press Enter to skip.

  number    a number input      weight: 'Vikt (kg)', step 0,1
  checkbox  yes / no            meal: 'Åt upp'
  count     a −/+ stepper       walk: 'Kiss', reads back as 'kiss ×3'
  reveal    a checkbox that     accident: 'Olycka', uncovering 'Spydde'
            uncovers more,      and 'Bajsade' — one of which must then
            and needs one       be chosen
`);

	// Field loop: an empty name ends it, so zero fields is one keypress.
	for (;;) {
		const field = await askField('');
		if (!field) {
			break;
		}
		fields.push(field);

		// A reveal's fields are prompted for here, under it, so nothing has to
		// name a field typed several prompts ago. They flatten into the same
		// list, in the order the parser reads them.
		if (field.input === 'reveal') {
			for (;;) {
				const revealed = await askField('  ', field.name);
				if (!revealed) {
					break;
				}
				fields.push(revealed);
			}
		}
	}
}

const statsAnswer = await ask(flags.stats, 'Stats card (none/counts/trend)', 'none');
let stats: StatsSpec = { kind: 'none' };
if (statsAnswer === 'counts') {
	stats = { kind: 'counts-per-day' };
} else if (statsAnswer === 'trend') {
	const numberFields = fields
		.filter((field) => field.input === 'number')
		.map((field) => field.name);
	stats = {
		kind: 'trend-line',
		field: await ask(flags['trend-field'], `Field to plot (${numberFields.join('/')})`),
		unit: await ask(flags['trend-unit'], "Axis unit (like 'kg')")
	};
} else if (statsAnswer !== 'none') {
	console.error(`Unknown stats kind '${statsAnswer}' — none, counts or trend.`);
	process.exit(1);
}

const migrationSources = readdirSync(MIGRATIONS_DIR)
	.filter((name) => name.endsWith('.sql'))
	.map((name) => readFileSync(join(MIGRATIONS_DIR, name), 'utf8'));
const fieldsSource = readFileSync(join(ROOT, 'src/lib/events/fields.ts'), 'utf8');
const localeSource = readFileSync(join(ROOT, 'src/lib/locale.ts'), 'utf8');

// Not prompted for: the end of the grid is right for a new tile, and the
// flag is there for the rare deliberate placement.
const sortOrder = Number(flags['sort-order'] ?? nextSortOrder(migrationSources));
rl.close();

const spec: EventSpec = {
	id,
	label,
	icon,
	category: category as EventSpec['category'],
	intervalDays: intervalRaw && intervalRaw !== 'none' ? Number(intervalRaw) : null,
	sortOrder,
	fields,
	stats
};
if (!['routine', 'care', 'health', 'other'].includes(category)) {
	console.error(`Unknown category '${category}'.`);
	process.exit(1);
}

const errors = validateSpec(spec, existingTypeIds(migrationSources, fieldsSource));
if (errors.length > 0) {
	for (const error of errors) {
		console.error(`✖ ${error}`);
	}
	process.exit(1);
}

const templates = {
	counts: readFileSync(new URL('./templates/counts-card.svelte.tpl', import.meta.url), 'utf8'),
	trend: readFileSync(new URL('./templates/trend-card.svelte.tpl', import.meta.url), 'utf8')
};
const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
const { creates, edits, notes } = generate(spec, templates, stamp, localeSource);

/** The snippet goes on the line after its marker, indentation carried by it. */
function applyEdit(source: string, marker: string, insert: string): string {
	const lines = source.split('\n');
	const at = lines.findIndex((line) => line.includes(marker));
	if (at === -1) {
		throw new Error(`marker '${marker}' is missing — restore it before generating`);
	}
	lines.splice(at + 1, 0, insert.replace(/\n$/, ''));
	return lines.join('\n');
}

// All-or-nothing: every marker and every create path is checked before the
// first byte is written, so a broken run never leaves a half-generated type.
const edited = new Map<string, string>();
for (const edit of edits) {
	const path = join(ROOT, edit.path);
	const source = edited.get(path) ?? readFileSync(path, 'utf8');
	edited.set(path, applyEdit(source, edit.marker, edit.insert));
}
for (const create of creates) {
	if (existsSync(join(ROOT, create.path))) {
		throw new Error(`${create.path} already exists`);
	}
}

if (flags['dry-run']) {
	for (const create of creates) {
		console.log(`\n── would create ${create.path} ──\n${create.content}`);
	}
	for (const edit of edits) {
		console.log(`\n── would insert at ${edit.marker} in ${edit.path} ──\n${edit.insert}`);
	}
	// The notes say which generated strings to look at, which is most of what a
	// dry run is for; exiting before them hid exactly that.
	for (const note of notes) {
		console.log(`\nnote: ${note}`);
	}
	process.exit(0);
}

for (const create of creates) {
	writeFileSync(join(ROOT, create.path), create.content);
	console.log(`created  ${create.path}`);
}
for (const [path, content] of edited) {
	writeFileSync(path, content);
	console.log(`updated  ${path.slice(ROOT.length)}`);
}

// Best-effort: the checklist below runs the real formatter/checker anyway.
try {
	const touched = [...creates.map((create) => join(ROOT, create.path)), ...edited.keys()].filter(
		(path) => !path.endsWith('.sql')
	);
	execFileSync('npx', ['prettier', '--write', ...touched], { cwd: ROOT, stdio: 'ignore' });
} catch {
	console.warn('prettier pass failed — run npm run format yourself');
}

for (const note of notes) {
	console.log(`\nnote: ${note}`);
}
// Said outright because leaving it implied is what made a generated type look
// half-broken: the stats card appeared immediately (it is code) and the tile did
// not (it is a row).
console.log(`
The tile is not live yet — the log grid renders from event_types rows, and this
migration has not been applied to any database.

  npm run db-local     apply it locally and see it now
  npm run db-push      production — only after the PR merges

Next (the house rules):
  1. Review the diff.
  2. npm run format && npm run check && npm test
  3. Feature branch + PR; Marcus merges.
  4. npm run db-push — only after the merge. Never from an unmerged branch.
`);
