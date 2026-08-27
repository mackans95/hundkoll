// The generator's pure core against a fixture spec. The card templates are
// read from disk on purpose: a template drifting away from the tokens the
// core fills fails here, not in a future generation.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
	existingKeysAfter,
	existingTypeIds,
	generate,
	nextSortOrder,
	renderTemplate,
	validateSpec,
	type EventSpec,
	type MetricSpec
} from '../scripts/new-event-core.ts';

const templates = {
	counts: readFileSync(
		new URL('../scripts/templates/counts-card.svelte.tpl', import.meta.url),
		'utf8'
	),
	trend: readFileSync(
		new URL('../scripts/templates/trend-card.svelte.tpl', import.meta.url),
		'utf8'
	)
};

const SEED_SQL = `insert into event_types (id, label, category, interval_days, sort_order) values
	('walk', 'Promenad', 'routine', null, 10),
	('bath', 'Bad', 'care', 56, 60);
insert into dogs (name) values ('Våfflan');`;
const ACCIDENT_SQL = `insert into event_types (id, label, category, interval_days, icon, sort_order)
values ('accident', 'Olycka', 'routine', null, '⚠️', 30);`;
const FIELDS_SOURCE = `export const DETAIL_FIELDS: Record<string, DetailField[]> = {
	walk: [
	],
	meal: [
	]
};`;

// Shaped like locale.ts around its markers, since that shape is what
// existingKeysAfter reads: keys at the marker's own indentation, the block
// ending at the first line indented less.
const LOCALE_SOURCE = `export const units = {
	// codegen:units — npm run new-event inserts unfamiliar units here
	minutes: (value: string) => \`\${value} min\` as const,
	kilograms: (value: string) => \`\${value} kg\` as const
} as const;

export const activities = {
	fields: {
		// codegen:field-labels — npm run new-event inserts field labels here
		durationMin: 'Längd (minuter)',
		poop: 'Bajs'
	},
	summary: {
		// codegen:summary-words — npm run new-event inserts summary fragments here
		poop: 'bajs',
		separator: ' · '
	}
} as const;

export const stats = {
	// codegen:stats-strings — npm run new-event inserts card strings here
	title: nav.stats
} as const;`;

const fixture: EventSpec = {
	id: 'nail_check',
	label: 'Klokoll',
	icon: '✂️',
	category: 'other',
	intervalDays: 21,
	sortOrder: 100,
	fields: [
		{ name: 'claw_len', label: 'Klolängd', input: 'number', step: '0.1', unit: 'mm' },
		{ name: 'bled', label: 'Blödde', input: 'checkbox' },
		{ name: 'clipped', label: 'Klippt klo', input: 'count' }
	],
	stats: { kind: 'counts-per-day', metrics: [] }
};

describe('validateSpec', () => {
	it('accepts the fixture', () => {
		expect(validateSpec(fixture, ['walk', 'meal'])).toEqual([]);
	});

	it('rejects ids that are not english snake_case', () => {
		for (const id of ['Klokoll', 'nail-check', '1nail', 'nail check']) {
			expect(validateSpec({ ...fixture, id }, [])).not.toEqual([]);
		}
	});

	it('rejects an id the catalogue already has', () => {
		expect(validateSpec({ ...fixture, id: 'walk' }, ['walk'])).toEqual([
			"id 'walk' already exists in the catalogue."
		]);
	});

	it('rejects duplicate, reserved and _count-suffixed field names', () => {
		const twice = { ...fixture.fields[0] };
		expect(validateSpec({ ...fixture, fields: [fixture.fields[0], twice] }, [])).not.toEqual([]);
		expect(
			validateSpec({ ...fixture, fields: [{ name: 'note', label: 'x', input: 'checkbox' }] }, [])
		).not.toEqual([]);
		expect(
			validateSpec({ ...fixture, fields: [{ name: 'pee_count', label: 'x', input: 'count' }] }, [])
		).not.toEqual([]);
	});

	it('requires a unit on number fields, since the summary appends it', () => {
		expect(
			validateSpec(
				{
					...fixture,
					stats: { kind: 'none' },
					fields: [{ name: 'len', label: 'x', input: 'number' }]
				},
				[]
			)
		).not.toEqual([]);
	});

	// A reveal is a checkbox that uncovers other fields, and the rules exist
	// because parsing walks the list once, deciding each field by its parent.
	describe('a reveal and the fields under it', () => {
		const reveal = (fields: EventSpec['fields']) =>
			validateSpec({ ...fixture, stats: { kind: 'none' }, fields }, []);

		const VALID: EventSpec['fields'] = [
			{ name: 'accident', label: 'Olycka', input: 'reveal' },
			{ name: 'vomit', label: 'Spydde', input: 'checkbox', revealedBy: 'accident' }
		];

		it('accepts a reveal declared before what it uncovers', () => {
			expect(reveal(VALID)).toEqual([]);
		});

		it('rejects a reveal that uncovers nothing', () => {
			expect(reveal([{ name: 'accident', label: 'Olycka', input: 'reveal' }])).toEqual([
				"reveal 'accident' uncovers nothing — a reveal with no fields is a checkbox."
			]);
		});

		it('rejects a revealedBy naming a field that is not declared', () => {
			expect(
				reveal([{ name: 'vomit', label: 'Spydde', input: 'checkbox', revealedBy: 'nope' }])
			).toEqual(["field 'vomit' is revealed by 'nope', which is not declared."]);
		});

		it('rejects a field declared before the reveal that uncovers it', () => {
			expect(reveal([VALID[1], VALID[0]])).toEqual([
				"field 'vomit' must be declared after 'accident', which reveals it."
			]);
		});

		it('rejects being revealed by an ordinary checkbox', () => {
			expect(
				reveal([
					{ name: 'accident', label: 'Olycka', input: 'checkbox' },
					{ name: 'vomit', label: 'Spydde', input: 'checkbox', revealedBy: 'accident' }
				])
			).toEqual(["field 'vomit' is revealed by 'accident', which is a checkbox, not a reveal."]);
		});

		it('rejects a reveal inside a reveal — one level only', () => {
			const errors = reveal([
				...VALID,
				{ name: 'inner', label: 'Mer', input: 'reveal', revealedBy: 'accident' },
				{ name: 'deep', label: 'Djupt', input: 'checkbox', revealedBy: 'inner' }
			]);
			expect(errors).toContain("field 'inner' is a reveal, so it cannot itself be revealed.");
		});

		it('rejects a field revealing itself', () => {
			expect(
				reveal([{ name: 'accident', label: 'Olycka', input: 'reveal', revealedBy: 'accident' }])
			).toContain("field 'accident' cannot reveal itself.");
		});
	});

	// Metrics are the tiles under a generated chart. Every rule here is about
	// asking a field a question it can answer.
	describe('card metrics', () => {
		const withMetrics = (metrics: MetricSpec[]) =>
			validateSpec({ ...fixture, stats: { kind: 'counts-per-day', metrics } }, []);

		it('accepts an average of a number and a share of a checkbox', () => {
			expect(
				withMetrics([
					{ kind: 'avg', field: 'claw_len', label: 'Snittlängd' },
					{ kind: 'share', field: 'bled', label: 'Blödde' },
					{ kind: 'share-without', field: 'bled', label: 'Utan blod' }
				])
			).toEqual([]);
		});

		it('rejects a metric on a field that is not declared', () => {
			expect(withMetrics([{ kind: 'avg', field: 'nope', label: 'x' }])).toEqual([
				"metric 'avg' measures 'nope', which is not declared."
			]);
		});

		it('sends an average of a checkbox to share instead', () => {
			expect(withMetrics([{ kind: 'avg', field: 'bled', label: 'x' }])).toEqual([
				"metric 'avg' needs a number field; 'bled' is a checkbox — use share instead."
			]);
		});

		it('rejects a share of a number', () => {
			expect(withMetrics([{ kind: 'share', field: 'claw_len', label: 'x' }])).toEqual([
				"metric 'share' needs something answered yes or no; 'claw_len' is a number."
			]);
		});

		it('requires a label, and refuses the same tile twice', () => {
			expect(withMetrics([{ kind: 'avg', field: 'claw_len', label: '  ' }])).toEqual([
				"metric 'avg' on 'claw_len' needs a Swedish label."
			]);
			expect(
				withMetrics([
					{ kind: 'avg', field: 'claw_len', label: 'A' },
					{ kind: 'avg', field: 'claw_len', label: 'B' }
				])
			).toEqual(["metric 'avg' on 'claw_len' is declared twice."]);
		});

		// A count is answered yes or no in the sense a share needs: zero or not.
		it('lets a share measure a count', () => {
			expect(withMetrics([{ kind: 'share', field: 'clipped', label: 'x' }])).toEqual([]);
		});
	});

	it('only lets a trend line plot a declared number field', () => {
		expect(
			validateSpec({ ...fixture, stats: { kind: 'trend-line', field: 'claw_len', unit: 'mm' } }, [])
		).toEqual([]);
		expect(
			validateSpec({ ...fixture, stats: { kind: 'trend-line', field: 'missing', unit: 'mm' } }, [])
		).not.toEqual([]);
		expect(
			validateSpec({ ...fixture, stats: { kind: 'trend-line', field: 'bled', unit: 'mm' } }, [])
		).not.toEqual([]);
	});
});

describe('catalogue parsing', () => {
	it('collects ids from event_types inserts only, plus DETAIL_FIELDS keys', () => {
		const ids = existingTypeIds([SEED_SQL, ACCIDENT_SQL], FIELDS_SOURCE);
		expect(ids.sort()).toEqual(['accident', 'bath', 'meal', 'walk']);
	});

	it('picks the next sort order past everything inserted', () => {
		expect(nextSortOrder([SEED_SQL, ACCIDENT_SQL])).toBe(70);
	});
});

describe('existingKeysAfter', () => {
	// The boundary matters: locale.ts nests these blocks, and reading past one
	// would report keys that are not there and skip strings that are needed.
	it('reads one block and stops where it ends', () => {
		expect([...existingKeysAfter(LOCALE_SOURCE, 'codegen:field-labels')].sort()).toEqual([
			'durationMin',
			'poop'
		]);
		expect([...existingKeysAfter(LOCALE_SOURCE, 'codegen:summary-words')].sort()).toEqual([
			'poop',
			'separator'
		]);
		expect([...existingKeysAfter(LOCALE_SOURCE, 'codegen:units')].sort()).toEqual([
			'kilograms',
			'minutes'
		]);
	});

	it('reports nothing for a marker that is not there', () => {
		expect(existingKeysAfter(LOCALE_SOURCE, 'codegen:nope').size).toBe(0);
	});
});

describe('renderTemplate', () => {
	it('fills every token and refuses leftovers', () => {
		expect(renderTemplate('a {{x}} b {{x}}', { x: '1' })).toBe('a 1 b 1');
		expect(() => renderTemplate('a {{x}} {{y}}', { x: '1' })).toThrow(/y/);
	});
});

describe('generate', () => {
	const output = generate(fixture, templates, '20260820120000', LOCALE_SOURCE);

	it('writes the one insert the type needs', () => {
		const migration = output.creates.find((create) => create.path.endsWith('.sql'));
		expect(migration?.path).toBe(
			'supabase/migrations/20260820120000_add_nail_check_event_type.sql'
		);
		expect(migration?.content).toBe(
			'insert into event_types (id, label, category, interval_days, icon, sort_order)\n' +
				"values ('nail_check', 'Klokoll', 'other', 21, '✂️', 100);\n"
		);
	});

	it('declares each field with a summarize matching its input type', () => {
		const fields = output.edits.find((edit) => edit.marker === 'codegen:detail-fields');
		expect(fields?.insert).toContain('nail_check: [');
		expect(fields?.insert).toContain('locale.units.mm(String(value)');
		expect(fields?.insert).toContain('countText(value, locale.activities.summary.clipped)');
		expect(fields?.insert).toContain('locale.activities.summary.notBled');
	});

	it('adds labels, summary words and the unfamiliar unit to locale', () => {
		const markers = output.edits
			.filter((edit) => edit.path === 'src/lib/locale.ts')
			.map((edit) => edit.marker);
		expect(markers).toContain('codegen:field-labels');
		expect(markers).toContain('codegen:summary-words');
		expect(markers).toContain('codegen:units');
		expect(markers).toContain('codegen:stats-strings');
		const units = output.edits.find((edit) => edit.marker === 'codegen:units');
		expect(units?.insert).toContain('mm: (value: string) =>');
	});

	it('scaffolds the counts card with every stats.ts insertion', () => {
		const statsMarkers = output.edits
			.filter((edit) => edit.path === 'src/lib/server/stats.ts')
			.map((edit) => edit.marker);
		expect(statsMarkers.sort()).toEqual([
			'codegen:stats-queries',
			'codegen:stats-results',
			'codegen:stats-return',
			'codegen:stats-shape'
		]);
		const card = output.creates.find((create) => create.path.endsWith('.svelte'));
		expect(card?.path).toBe('src/lib/components/stats/NailCheckCard.svelte');
		expect(card?.content).toContain('NAIL_CHECK_COLOR');
		expect(card?.content).toContain('locale.stats.nailCheck.heading');
		expect(card?.content).not.toMatch(/{{[A-Za-z]+}}/);
	});

	it('scaffolds a trend card around fieldHistory instead', () => {
		const trend = generate(
			{ ...fixture, stats: { kind: 'trend-line', field: 'claw_len', unit: 'mm' } },
			templates,
			'20260820120000',
			LOCALE_SOURCE
		);
		const query = trend.edits.find((edit) => edit.marker === 'codegen:stats-queries');
		expect(query?.insert).toContain("fieldHistory(db, 'nail_check', 'claw_len')");
		const card = trend.creates.find((create) => create.path.endsWith('.svelte'));
		expect(card?.content).toContain('unit="mm"');
		expect(card?.content).not.toMatch(/{{[A-Za-z]+}}/);
	});

	// The nested prompt flattens into this, and the flat list is what the parser
	// and the renderer both read.
	it('declares a reveal flat, in order, with no wording of its own', () => {
		const output = generate(
			{
				...fixture,
				stats: { kind: 'none' },
				fields: [
					{ name: 'accident', label: 'Olycka', input: 'reveal' },
					{ name: 'vomit', label: 'Spydde', input: 'checkbox', revealedBy: 'accident' },
					{ name: 'minute', label: 'Minut', input: 'number', unit: 'min', step: '1' }
				]
			},
			templates,
			'20260820120000',
			LOCALE_SOURCE
		);
		const fields =
			output.edits.find((edit) => edit.marker === 'codegen:detail-fields')?.insert ?? '';

		expect(fields).toContain("input: 'reveal'");
		expect(fields).toContain("revealedBy: 'accident'");
		expect(fields.indexOf("name: 'accident'")).toBeLessThan(fields.indexOf("name: 'vomit'"));

		// The reveal gets no summarize; the cause it uncovers gets one with no
		// "inte …" branch, since it is never stored false.
		const reveal = fields.slice(
			fields.indexOf("name: 'accident'"),
			fields.indexOf("name: 'vomit'")
		);
		expect(reveal).not.toContain('summarize');
		expect(fields).toContain('value === true ? locale.activities.summary.vomit : null');
		expect(fields).not.toContain('notVomit');

		const words =
			output.edits.find((edit) => edit.marker === 'codegen:summary-words')?.insert ?? '';
		expect(words).toContain("vomit: 'spydde',");
		expect(words).not.toContain('notVomit');
		expect(words).not.toContain('accident');

		// A number keeps its unit and step wherever it is declared.
		expect(fields).toContain("step: '1'");
		expect(output.edits.some((edit) => edit.marker === 'codegen:units')).toBe(false);
	});

	// The duplicate-key bug: locale.ts already has poop, and TypeScript rejects
	// an object literal with the same property twice — so a second poop field
	// would break npm run check after the files were written.
	it('reuses a locale string that already exists instead of re-declaring it', () => {
		const output = generate(
			{
				...fixture,
				stats: { kind: 'none' },
				fields: [
					{ name: 'poop', label: 'Bajs', input: 'count' },
					{ name: 'bled', label: 'Blödde', input: 'checkbox' }
				]
			},
			templates,
			'20260820120000',
			LOCALE_SOURCE
		);

		const labels =
			output.edits.find((edit) => edit.marker === 'codegen:field-labels')?.insert ?? '';
		expect(labels).toContain('bled:');
		expect(labels).not.toContain('poop:');

		const words =
			output.edits.find((edit) => edit.marker === 'codegen:summary-words')?.insert ?? '';
		expect(words).not.toContain("poop: 'bajs'");
		expect(words).toContain("bled: 'blödde'");

		expect(output.notes.join(' ')).toContain('Reused the existing locale strings for poop');
	});

	it('does not re-declare a unit locale.units already has', () => {
		const output = generate(
			{
				...fixture,
				stats: { kind: 'none' },
				fields: [{ name: 'len', label: 'Längd', input: 'number', unit: 'min' }]
			},
			templates,
			'20260820120000',
			LOCALE_SOURCE
		);
		expect(output.edits.some((edit) => edit.marker === 'codegen:units')).toBe(false);
	});

	// The whole point of the generic view: two tiles, and not one line of SQL.
	it('turns metrics into tiles, captions and exactly one query — no migration', () => {
		const output = generate(
			{
				...fixture,
				stats: {
					kind: 'counts-per-day',
					metrics: [
						{ kind: 'avg', field: 'claw_len', label: 'Snittlängd' },
						{ kind: 'share-without', field: 'bled', label: 'Utan blod' }
					]
				}
			},
			templates,
			'20260820120000',
			LOCALE_SOURCE
		);

		// One migration, and it is the event_types insert — nothing else.
		const sql = output.creates.filter((create) => create.path.endsWith('.sql'));
		expect(sql).toHaveLength(1);
		expect(sql[0].content).toContain('insert into event_types');

		const card = output.creates.find((create) => create.path.endsWith('.svelte'))?.content ?? '';
		expect(card).toContain(
			"avgTile(locale.stats.nailCheck.avgClawLen, metricFor(metrics, 'claw_len')"
		);
		expect(card).toContain(
			"shareTile(locale.stats.nailCheck.withoutBled, metricFor(metrics, 'bled'), totalEvents(days), true)"
		);
		expect(card).toContain('<StatTile {tile} />');
		expect(card).not.toMatch(/{{[A-Za-z]+}}/);

		const captions =
			output.edits.find((edit) => edit.marker === 'codegen:stats-strings')?.insert ?? '';
		expect(captions).toContain("avgClawLen: 'Snittlängd',");
		expect(captions).toContain("withoutBled: 'Utan blod',");

		// One query for both tiles: the view is long, so they are two rows of it.
		const queries = output.edits.filter((edit) => edit.marker === 'codegen:stats-queries');
		expect(queries).toHaveLength(2);
		expect(queries.filter((q) => q.insert.includes('stats_detail_metrics'))).toHaveLength(1);

		const card2 = output.edits.find((edit) => edit.marker === 'codegen:stats-cards')?.insert ?? '';
		expect(card2).toContain('metrics={data.nailCheckMetrics}');
	});

	// A number in minutes goes through minutesText, which switches to hours; any
	// other unit takes its own locale function.
	it('writes an average in the unit its field declared', () => {
		const card = (unit: string) =>
			generate(
				{
					...fixture,
					fields: [{ name: 'len', label: 'Längd', input: 'number', unit }],
					stats: {
						kind: 'counts-per-day',
						metrics: [{ kind: 'avg', field: 'len', label: 'Snitt' }]
					}
				},
				templates,
				'20260820120000',
				LOCALE_SOURCE
			).creates.find((create) => create.path.endsWith('.svelte'))?.content ?? '';

		expect(card('min')).toContain('format.minutesText');
		expect(card('kg')).toContain('locale.units.kilograms(format.swedishNumber(value))');
	});

	it('leaves a counts card without metrics exactly as it was', () => {
		const output = generate(
			{ ...fixture, stats: { kind: 'counts-per-day', metrics: [] } },
			templates,
			'20260820120000',
			LOCALE_SOURCE
		);
		const card = output.creates.find((create) => create.path.endsWith('.svelte'))?.content ?? '';
		expect(card).not.toContain('StatTile');
		expect(card).not.toContain('const tiles = $derived(');
		expect(card).not.toMatch(/{{[A-Za-z]+}}/);
		expect(output.edits.some((edit) => edit.insert.includes('stats_detail_metrics'))).toBe(false);
		expect(output.edits.some((edit) => edit.insert.includes('metrics={data.'))).toBe(false);
	});

	it('generates nothing field-related for a bare timestamp type', () => {
		const bare = generate(
			{ ...fixture, fields: [], stats: { kind: 'none' } },
			templates,
			'20260820120000',
			LOCALE_SOURCE
		);
		expect(bare.creates).toHaveLength(1);
		expect(bare.edits).toEqual([]);
	});
});
