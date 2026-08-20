// The generator's pure core against a fixture spec. The card templates are
// read from disk on purpose: a template drifting away from the tokens the
// core fills fails here, not in a future generation.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
	existingTypeIds,
	generate,
	nextSortOrder,
	renderTemplate,
	validateSpec,
	type EventSpec
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
	stats: { kind: 'counts-per-day' }
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

describe('renderTemplate', () => {
	it('fills every token and refuses leftovers', () => {
		expect(renderTemplate('a {{x}} b {{x}}', { x: '1' })).toBe('a 1 b 1');
		expect(() => renderTemplate('a {{x}} {{y}}', { x: '1' })).toThrow(/y/);
	});
});

describe('generate', () => {
	const output = generate(fixture, templates, '20260820120000');

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
			'20260820120000'
		);
		const query = trend.edits.find((edit) => edit.marker === 'codegen:stats-queries');
		expect(query?.insert).toContain("fieldHistory(db, 'nail_check', 'claw_len')");
		const card = trend.creates.find((create) => create.path.endsWith('.svelte'));
		expect(card?.content).toContain('unit="mm"');
		expect(card?.content).not.toMatch(/{{[A-Za-z]+}}/);
	});

	it('generates nothing field-related for a bare timestamp type', () => {
		const bare = generate(
			{ ...fixture, fields: [], stats: { kind: 'none' } },
			templates,
			'20260820120000'
		);
		expect(bare.creates).toHaveLength(1);
		expect(bare.edits).toEqual([]);
	});
});
