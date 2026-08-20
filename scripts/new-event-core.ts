// The pure half of `npm run new-event`: a spec in, generated artifacts out.
// No filesystem, no prompts — that lives in new-event.ts — so the whole
// generator is testable against a fixture spec (tests/new-event.test.ts).

export type FieldInput = 'number' | 'checkbox' | 'count';

export type FieldSpec = {
	/** English snake_case, the key in the event's details jsonb. */
	name: string;
	/** Swedish, what the form input is called. */
	label: string;
	input: FieldInput;
	step?: string;
	required?: boolean;
	/** number fields: the unit suffix summaries append, e.g. 'min' or 'kg'. */
	unit?: string;
};

export type StatsSpec =
	| { kind: 'none' }
	| { kind: 'counts-per-day' }
	| { kind: 'trend-line'; field: string; unit: string };

export type EventSpec = {
	/** English snake_case id — the event_types primary key. */
	id: string;
	/** Swedish name — the log-button label. */
	label: string;
	icon: string;
	category: 'routine' | 'care' | 'health' | 'other';
	intervalDays: number | null;
	sortOrder: number;
	fields: FieldSpec[];
	stats: StatsSpec;
};

export type FileEdit = { path: string; marker: string; insert: string };
export type FileCreate = { path: string; content: string };
export type Generated = { creates: FileCreate[]; edits: FileEdit[]; notes: string[] };

const ID_RE = /^[a-z][a-z0-9_]*$/;

/** Form-machinery names a detail field must not shadow. */
const RESERVED_FIELD_NAMES = ['id', 'type_id', 'occurred_at', 'note', 'detailed'];

/** Units locale.ts already phrases, so known ones are not re-declared. */
const KNOWN_UNITS: Record<string, string> = {
	min: 'minutes',
	tim: 'hours',
	kg: 'kilograms',
	g: 'grams'
};

/** 'nail_trim' → 'nailTrim' */
export function camel(name: string): string {
	return name.replace(/_([a-z0-9])/g, (_, letter: string) => letter.toUpperCase());
}

/** 'nail_trim' → 'NailTrim' */
export function pascal(name: string): string {
	const camelName = camel(name);
	return camelName.charAt(0).toUpperCase() + camelName.slice(1);
}

/** Single quotes doubled, for a value inside a SQL string literal. */
function sqlString(value: string): string {
	return value.replace(/'/g, "''");
}

/** Backslashes and quotes escaped, for a value inside a TS string literal. */
function tsString(value: string): string {
	return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/**
 * Says what is wrong with a spec, as sentences; an empty list means valid.
 */
export function validateSpec(spec: EventSpec, existingIds: string[]): string[] {
	const errors: string[] = [];

	if (!ID_RE.test(spec.id)) {
		errors.push(`id '${spec.id}' must match ${ID_RE} (english snake_case).`);
	}
	if (existingIds.includes(spec.id)) {
		errors.push(`id '${spec.id}' already exists in the catalogue.`);
	}
	if (!spec.label.trim()) {
		errors.push('label (the Swedish name) must not be empty.');
	}
	if (!spec.icon.trim()) {
		errors.push('icon must not be empty.');
	}
	if (
		spec.intervalDays !== null &&
		(!Number.isInteger(spec.intervalDays) || spec.intervalDays < 1)
	) {
		errors.push('interval must be a whole number of days (at least 1), or none.');
	}
	if (!Number.isInteger(spec.sortOrder)) {
		errors.push('sort order must be a whole number.');
	}

	const seen = new Set<string>();
	for (const field of spec.fields) {
		if (!ID_RE.test(field.name)) {
			errors.push(`field '${field.name}' must match ${ID_RE} (english snake_case).`);
		}
		if (RESERVED_FIELD_NAMES.includes(field.name)) {
			errors.push(`field '${field.name}' collides with a form-machinery name.`);
		}
		if (field.name.endsWith('_count')) {
			errors.push(
				`field '${field.name}' must not end with _count — count fields submit that suffix.`
			);
		}
		if (seen.has(field.name)) {
			errors.push(`field '${field.name}' is declared twice.`);
		}
		seen.add(field.name);
		if (!field.label.trim()) {
			errors.push(`field '${field.name}' needs a Swedish label.`);
		}
		if (field.input === 'number' && !field.unit?.trim()) {
			errors.push(`field '${field.name}' is a number, so its summary needs a unit (like 'min').`);
		}
	}

	if (spec.stats.kind === 'trend-line') {
		const stats = spec.stats;
		const target = spec.fields.find((field) => field.name === stats.field);
		if (!target) {
			errors.push(`trend-line plots field '${stats.field}', which is not declared.`);
		} else if (target.input !== 'number') {
			errors.push(
				`trend-line can only plot a number field; '${target.name}' is a ${target.input}.`
			);
		}
	}

	return errors;
}

/**
 * Reads every event-type id already inserted by a migration, plus the keys of
 * DETAIL_FIELDS, so a new id cannot collide with either.
 */
export function existingTypeIds(migrationSources: string[], fieldsSource: string): string[] {
	const ids = new Set<string>();

	for (const source of migrationSources) {
		for (const statement of source.match(/insert\s+into\s+event_types[\s\S]*?;/gi) ?? []) {
			for (const tuple of statement.matchAll(/\(\s*'([a-z0-9_]+)'/g)) {
				ids.add(tuple[1]);
			}
		}
	}
	for (const key of fieldsSource.matchAll(/^\t([a-z][a-z0-9_]*): \[/gm)) {
		ids.add(key[1]);
	}

	return [...ids];
}

/**
 * The next free sort_order: 10 past the highest one any migration inserted,
 * so a new tile lands at the end of the grid.
 */
export function nextSortOrder(migrationSources: string[]): number {
	let max = 0;
	for (const source of migrationSources) {
		for (const statement of source.match(/insert\s+into\s+event_types[\s\S]*?;/gi) ?? []) {
			for (const tuple of statement.matchAll(/,\s*(\d+)\s*\)/g)) {
				max = Math.max(max, Number(tuple[1]));
			}
		}
	}
	return max + 10;
}

/**
 * Fills {{token}} placeholders in a card template, refusing to leave any
 * behind — a leftover means the template and this generator have drifted.
 */
export function renderTemplate(template: string, tokens: Record<string, string>): string {
	let output = template;
	for (const [token, value] of Object.entries(tokens)) {
		output = output.replaceAll(`{{${token}}}`, value);
	}
	const leftover = output.match(/{{[A-Za-z]+}}/);
	if (leftover) {
		throw new Error(`template token ${leftover[0]} was not filled`);
	}
	return output;
}

/** The one insert the type needs; everything else is optional on top. */
function migrationSql(spec: EventSpec): string {
	const interval = spec.intervalDays === null ? 'null' : String(spec.intervalDays);
	return (
		`insert into event_types (id, label, category, interval_days, icon, sort_order)\n` +
		`values ('${spec.id}', '${sqlString(spec.label)}', '${spec.category}', ${interval}, ` +
		`'${sqlString(spec.icon)}', ${spec.sortOrder});\n`
	);
}

/** How a field's value reads in the events list, per input type. */
function summarizeSource(field: FieldSpec): string {
	const word = `locale.activities.summary.${camel(field.name)}`;
	if (field.input === 'count') {
		return `(value) => countText(value, ${word})`;
	}
	if (field.input === 'checkbox') {
		return (
			`(value) =>\n` +
			`\t\t\t\tvalue === true\n` +
			`\t\t\t\t\t? ${word}\n` +
			`\t\t\t\t\t: value === false\n` +
			`\t\t\t\t\t\t? locale.activities.summary.not${pascal(field.name)}\n` +
			`\t\t\t\t\t\t: null`
		);
	}
	const unit = field.unit?.trim() ?? '';
	const unitFunction = `locale.units.${KNOWN_UNITS[unit] ?? camel(unit.replace(/[^a-zA-Zåäö0-9]+/g, '_'))}`;
	return (
		`(value) =>\n` +
		`\t\t\t\ttypeof value === 'number' ? ${unitFunction}(String(value).replace('.', ',')) : null`
	);
}

/** One DETAIL_FIELDS entry: the form input, parsing and summary in one go. */
function fieldsSnippet(spec: EventSpec): string {
	const entries = spec.fields.map((field) => {
		const props = [
			`\t\t\tname: '${field.name}'`,
			`\t\t\tlabel: locale.activities.fields.${camel(field.name)}`,
			`\t\t\tinput: '${field.input}'`
		];
		if (field.step) {
			props.push(`\t\t\tstep: '${field.step}'`);
		}
		if (field.required) {
			props.push(`\t\t\trequired: true`);
		}
		props.push(`\t\t\tsummarize: ${summarizeSource(field)}`);
		return `\t\t{\n${props.join(',\n')}\n\t\t}`;
	});
	return `\t${spec.id}: [\n${entries.join(',\n')}\n\t],\n`;
}

/** Locale entries for units the catalogue has not needed before. */
function newUnitSnippets(spec: EventSpec): string[] {
	const snippets: string[] = [];
	const added = new Set<string>();
	for (const field of spec.fields) {
		const unit = field.unit?.trim() ?? '';
		if (field.input !== 'number' || !unit || KNOWN_UNITS[unit] || added.has(unit)) {
			continue;
		}
		added.add(unit);
		const key = camel(unit.replace(/[^a-zA-Zåäö0-9]+/g, '_'));
		snippets.push('\t' + key + ': (value: string) => `${value} ' + unit + '` as const,\n');
	}
	return snippets;
}

/**
 * Everything the new type needs, as file creations and marker insertions.
 * The shell verifies every marker exists before writing anything.
 */
export function generate(
	spec: EventSpec,
	templates: { counts: string; trend: string },
	stamp: string
): Generated {
	const creates: FileCreate[] = [];
	const edits: FileEdit[] = [];
	const notes: string[] = [];

	creates.push({
		path: `supabase/migrations/${stamp}_add_${spec.id}_event_type.sql`,
		content: migrationSql(spec)
	});

	if (spec.fields.length > 0) {
		edits.push({
			path: 'src/lib/events/fields.ts',
			marker: 'codegen:detail-fields',
			insert: fieldsSnippet(spec)
		});
		edits.push({
			path: 'src/lib/locale.ts',
			marker: 'codegen:field-labels',
			insert: spec.fields
				.map((field) => `\t\t${camel(field.name)}: '${tsString(field.label)}',\n`)
				.join('')
		});

		const summaryWords = spec.fields.flatMap((field) => {
			const lower = field.label.toLowerCase();
			if (field.input === 'count') {
				return [`\t\t${camel(field.name)}: '${tsString(lower)}',\n`];
			}
			if (field.input === 'checkbox') {
				return [
					`\t\t${camel(field.name)}: '${tsString(lower)}',\n`,
					`\t\tnot${pascal(field.name)}: 'inte ${tsString(lower)}',\n`
				];
			}
			return [];
		});
		if (summaryWords.length > 0) {
			edits.push({
				path: 'src/lib/locale.ts',
				marker: 'codegen:summary-words',
				insert: summaryWords.join('')
			});
			if (spec.fields.some((field) => field.input === 'checkbox')) {
				notes.push(
					'Checkbox summary phrases were derived from the label — adjust them in locale.ts if the grammar reads wrong.'
				);
			}
		}

		const units = newUnitSnippets(spec);
		if (units.length > 0) {
			edits.push({
				path: 'src/lib/locale.ts',
				marker: 'codegen:units',
				insert: units.join('')
			});
			notes.push(
				'New unit entries were added to locale.units — rename their keys if a fuller word fits better.'
			);
		}
	}

	if (spec.stats.kind !== 'none') {
		const camelId = camel(spec.id);
		const pascalId = pascal(spec.id);
		const colorConst = `${spec.id.toUpperCase()}_COLOR`;
		const kebabId = spec.id.replace(/_/g, '-');
		const heading = `${spec.icon} ${spec.label}`;

		edits.push({
			path: 'src/lib/stats/palette.ts',
			marker: 'codegen:chart-colors',
			insert: `export const ${colorConst} = 'var(--chart-${kebabId})';\n`
		});
		edits.push({
			path: 'src/routes/layout.css',
			marker: 'codegen:chart-values',
			insert: `\t--chart-${kebabId}: light-dark(#475569, #94a3b8);\n`
		});
		notes.push(
			'The chart color pair defaults to slate — pick a better pair in layout.css if the card deserves one.'
		);
		edits.push({
			path: 'src/routes/stats/+page.svelte',
			marker: 'codegen:stats-imports',
			insert: `\timport ${pascalId}Card from '$lib/components/stats/${pascalId}Card.svelte';\n`
		});

		if (spec.stats.kind === 'counts-per-day') {
			edits.push({
				path: 'src/lib/locale.ts',
				marker: 'codegen:stats-strings',
				insert:
					`\t${camelId}: {\n` +
					`\t\theading: '${tsString(heading)}',\n` +
					`\t\ttooltipLabel: '${tsString(spec.label)}'\n` +
					`\t},\n`
			});
			edits.push({
				path: 'src/lib/server/stats.ts',
				marker: 'codegen:stats-shape',
				insert: `\t${camelId}Days: SimpleDay[];\n`
			});
			edits.push({
				path: 'src/lib/server/stats.ts',
				marker: 'codegen:stats-results',
				insert: `\t\t${camelId}Res,\n`
			});
			edits.push({
				path: 'src/lib/server/stats.ts',
				marker: 'codegen:stats-queries',
				insert:
					`\t\tdb\n` +
					`\t\t\t.from('stats_daily_counts')\n` +
					`\t\t\t.select('day, n')\n` +
					`\t\t\t.eq('type_id', '${spec.id}')\n` +
					`\t\t\t.gte('day', daysAgo(DAILY_WINDOW_DAYS))\n` +
					`\t\t\t.order('day'),\n`
			});
			edits.push({
				path: 'src/lib/server/stats.ts',
				marker: 'codegen:stats-return',
				insert: `\t\t${camelId}Days: present((${camelId}Res.data ?? []).map(toSimpleDay)),\n`
			});
			edits.push({
				path: 'src/routes/stats/+page.svelte',
				marker: 'codegen:stats-cards',
				insert:
					`\t<${pascalId}Card\n` +
					`\t\tdays={data.${camelId}Days}\n` +
					`\t\ttoday={data.today}\n` +
					`\t/>\n`
			});
			creates.push({
				path: `src/lib/components/stats/${pascalId}Card.svelte`,
				content: renderTemplate(templates.counts, {
					camelId,
					COLOR_CONST: colorConst
				})
			});
		} else {
			edits.push({
				path: 'src/lib/locale.ts',
				marker: 'codegen:stats-strings',
				insert:
					`\t${camelId}: {\n` +
					`\t\theading: '${tsString(heading)}',\n` +
					`\t\tempty: 'Ingen ${tsString(spec.label.toLowerCase())} loggad ännu.'\n` +
					`\t},\n`
			});
			edits.push({
				path: 'src/lib/server/stats.ts',
				marker: 'codegen:stats-shape',
				insert: `\t${camelId}Points: FieldPoint[];\n`
			});
			edits.push({
				path: 'src/lib/server/stats.ts',
				marker: 'codegen:stats-results',
				insert: `\t\t${camelId}Points,\n`
			});
			edits.push({
				path: 'src/lib/server/stats.ts',
				marker: 'codegen:stats-queries',
				insert: `\t\tfieldHistory(db, '${spec.id}', '${spec.stats.field}'),\n`
			});
			edits.push({
				path: 'src/lib/server/stats.ts',
				marker: 'codegen:stats-return',
				insert: `\t\t${camelId}Points,\n`
			});
			edits.push({
				path: 'src/routes/stats/+page.svelte',
				marker: 'codegen:stats-cards',
				insert: `\t<${pascalId}Card points={data.${camelId}Points} />\n`
			});
			creates.push({
				path: `src/lib/components/stats/${pascalId}Card.svelte`,
				content: renderTemplate(templates.trend, {
					camelId,
					COLOR_CONST: colorConst,
					unit: spec.stats.unit
				})
			});
			notes.push(
				"The trend-line empty-state sentence guesses at Swedish grammar ('Ingen … loggad') — adjust it in locale.ts."
			);
		}
	}

	return { creates, edits, notes };
}
