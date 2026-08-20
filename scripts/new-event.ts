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
                              repeatable; input is number | checkbox | count
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
		unit: parts.get('unit') || undefined
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

const fields: FieldSpec[] = (flags.field ?? []).map(parseFieldFlag);
if (flags.field === undefined) {
	// Field loop: an empty name ends it, so zero fields is one keypress.
	for (;;) {
		const name = (await rl.question('Field name (english snake_case, empty when done): ')).trim();
		if (!name) {
			break;
		}
		const fieldLabel = (await rl.question('  Swedish label: ')).trim();
		const input = ((await rl.question('  Input (number/checkbox/count) [checkbox]: ')).trim() ||
			'checkbox') as FieldInput;
		const field: FieldSpec = { name, label: fieldLabel, input };
		if (input === 'number') {
			field.unit = (await rl.question("  Unit for summaries (like 'min' or 'kg'): ")).trim();
			field.step = (await rl.question('  Step (empty for whole numbers): ')).trim() || undefined;
			field.required = (await rl.question('  Required? (y/N): ')).trim().toLowerCase() === 'y';
		}
		fields.push(field);
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
const { creates, edits, notes } = generate(spec, templates, stamp);

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
console.log(`
Next (the house rules):
  1. Review the diff.
  2. npm run format && npm run check && npm test
  3. Feature branch + PR; Marcus merges.
  4. npm run db-push — only after the merge. Never from an unmerged branch.
`);
