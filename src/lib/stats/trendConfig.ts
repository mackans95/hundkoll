// What Trender shows (plan 27): an ordered list of type + metric rows, stored
// per household as jsonb in trend_settings. Pure, so the rules are testable:
// which metrics a type supports, how a stored list is read back, and how the
// settings forms edit it.

import * as locale from '$lib/locale';
import { fieldsFor, shortFieldLabel, type DetailField } from '$lib/events/fields';
import type { EventType } from '$lib/types/domain';

/**
 *   count  events in the period            stats_type_buckets.n
 *   gap    average time between them       stats_type_buckets.avg_gap_min
 *   avg    average of a number field       stats_detail_buckets.avg_number
 *   share  how often a field happened      see shareSource
 */
export type TrendKind = 'count' | 'gap' | 'avg' | 'share';

/** Which way is an improvement; null keeps the badge neutral. */
export type Better = 'up' | 'down' | null;

export type TrendConfigRow = {
	type: string;
	kind: TrendKind;
	/** The detail field, for avg and share only. */
	field?: string;
	better: Better;
	/** Only the defaults carry one, so they keep today's names. */
	label?: string;
	/**
	 * What a share's field revealed, compared beneath it: Biltur's Olycka with
	 * Spydde and Bajsade under it. Field names, in declaration order.
	 */
	children?: string[];
};

/** Today's six rows, until the list is first edited. */
export const DEFAULT_TRENDS: TrendConfigRow[] = [
	{ type: 'walk', kind: 'count', better: null, label: locale.stats.trends.metrics.walks },
	{ type: 'walk', kind: 'gap', better: null, label: locale.stats.trends.metrics.walkGap },
	{
		type: 'walk',
		kind: 'avg',
		field: 'duration_min',
		better: null,
		label: locale.stats.trends.metrics.walkDuration
	},
	{ type: 'meal', kind: 'gap', better: null, label: locale.stats.trends.metrics.mealGap },
	{
		type: 'meal',
		kind: 'share',
		field: 'finished',
		better: 'up',
		label: locale.stats.trends.metrics.mealFinishRate
	},
	{ type: 'accident', kind: 'count', better: 'down', label: locale.stats.trends.metrics.accidents }
];

/** Identifies a row, so a list holds each metric once. "meal:share:finished" */
export function trendKey(row: Pick<TrendConfigRow, 'type' | 'kind' | 'field'>): string {
	return `${row.type}:${row.kind}:${row.field ?? ''}`;
}

/**
 * What a share divides by. A checkbox or outcome asked every time divides by
 * the events that answered, so a quick tap is not a "no". A reveal, a count, or
 * anything a reveal uncovers stores nothing when nothing happened, so over
 * the answered ones it would always be 100 %: it divides by every event.
 */
export function shareSource(field: DetailField): 'answered' | 'events' {
	return (field.input === 'checkbox' || field.input === 'outcome') && !field.revealedBy
		? 'answered'
		: 'events';
}

/** Every metric a type supports, in the order its page lists them. */
export function trendsFor(typeId: string): TrendConfigRow[] {
	return [
		{ type: typeId, kind: 'count', better: null },
		{ type: typeId, kind: 'gap', better: null },
		// Only the top level: what a field reveals is chosen under it (trendChildren).
		...fieldsFor(typeId)
			.filter((field) => !field.revealedBy)
			.map((field): TrendConfigRow => ({
				type: typeId,
				kind: field.input === 'number' ? 'avg' : 'share',
				field: field.name,
				better: null
			}))
	];
}

/**
 * The fields a row's field reveals, which it may compare beneath it: only a
 * share has them, since what it counted is what revealed them.
 */
export function trendChildren(row: Pick<TrendConfigRow, 'type' | 'kind' | 'field'>): DetailField[] {
	if (row.kind !== 'share' || !row.field) return [];
	return fieldsFor(row.type).filter((field) => field.revealedBy === row.field);
}

/** A sub-row as a row of its own, for reading its value: an average of a number, else a share. */
export function childRow(parent: TrendConfigRow, name: string): TrendConfigRow {
	const field = fieldsFor(parent.type).find((candidate) => candidate.name === name);
	return {
		type: parent.type,
		kind: field?.input === 'number' ? 'avg' : 'share',
		field: name,
		better: parent.better
	};
}

/** Only the sub-fields the row's field still reveals, each once, in declaration order. */
function keepChildren(row: TrendConfigRow, raw: unknown): string[] {
	const wanted = new Set(Array.isArray(raw) ? raw.filter((name) => typeof name === 'string') : []);
	return trendChildren(row)
		.map((field) => field.name)
		.filter((name) => wanted.has(name));
}

/**
 * Reads a stored list back, keeping only rows that still make sense: a known
 * type, a field it still has, and the kind that field supports. Anything else
 * is skipped, not an error, so removing a type never breaks Trender.
 */
export function parseTrendRows(raw: unknown, knownTypes: ReadonlySet<string>): TrendConfigRow[] {
	if (!Array.isArray(raw)) {
		return [];
	}

	const seen = new Set<string>();
	const rows: TrendConfigRow[] = [];
	for (const item of raw) {
		if (typeof item !== 'object' || item === null) continue;
		const { type, kind, field, better, label, children } = item as Record<string, unknown>;
		if (typeof type !== 'string' || !knownTypes.has(type)) continue;

		// A sub-field stored as a row of its own, from before rows had sub-rows:
		// it joins its parent's, if the list has that row.
		const revealedBy = fieldsFor(type).find((candidate) => candidate.name === field)?.revealedBy;
		if (revealedBy) {
			const parent = rows.find((row) => row.type === type && row.field === revealedBy);
			if (parent && trendChildren(parent).some((child) => child.name === field)) {
				parent.children = keepChildren(parent, [...(parent.children ?? []), field]);
			}
			continue;
		}

		const supported = trendsFor(type).find(
			(row) => row.kind === kind && (row.field ?? null) === (field ?? null)
		);
		if (!supported || seen.has(trendKey(supported))) continue;
		seen.add(trendKey(supported));

		const row: TrendConfigRow = {
			...supported,
			better: better === 'up' || better === 'down' ? better : null,
			...(typeof label === 'string' && label !== '' ? { label } : {})
		};
		const kept = keepChildren(row, children);
		rows.push(kept.length > 0 ? { ...row, children: kept } : row);
	}
	return rows;
}

/**
 * A row's name: its own label, or one built from the type and metric. The
 * add picker leaves the icon off, since its group heading already has it.
 */
export function trendLabel(
	row: TrendConfigRow,
	type: Pick<EventType, 'label' | 'icon'> | undefined,
	{ icon = true }: { icon?: boolean } = {}
): string {
	if (row.label) {
		return row.label;
	}

	const name = `${icon ? (type?.icon ?? '') : ''} ${type?.label ?? row.type}`.trim();
	return `${name} · ${trendMetricLabel(row)}`;
}

/** The metric alone, for a list already headed by its type: "Antal", "Kiss", "Lugn". */
export function trendMetricLabel(row: TrendConfigRow): string {
	const words = locale.stats.trends.kinds;
	if (row.kind === 'count') return words.count;
	if (row.kind === 'gap') return words.gap;

	const field = fieldsFor(row.type).find((candidate) => candidate.name === row.field);
	// An outcome names its "yes", which is what the share counts: "Lugn", not "Lugn?".
	return field?.outcome?.yes ?? shortFieldLabel(field?.label ?? row.field ?? '');
}

/**
 * The list in the order the settings form posted it, with each row's
 * direction, then the one edit its button asked for. Reordering and adding
 * happen on the page and arrive here only on Spara; without JS, each ▲ ▼ ✕
 * and Lägg till posts the list with its own edit.
 */
export function planTrendList(
	current: TrendConfigRow[],
	form: FormData
): { rows: TrendConfigRow[] } | { error: string } {
	const keys = form.getAll('key').map(String);
	const betters = form.getAll('better').map(String);
	if (keys.length !== betters.length) {
		return { error: locale.errors.saveFailed };
	}

	const byKey = new Map(current.map((row) => [trendKey(row), row]));
	const rows: TrendConfigRow[] = [];
	keys.forEach((key, i) => {
		// Stored rows keep their label; one added on the page is built afresh.
		const row = byKey.get(key) ?? addTrend([], key)[0];
		if (!row || rows.some((existing) => trendKey(existing) === key)) return;
		const better = betters[i];
		const next: TrendConfigRow = {
			...row,
			better: better === 'up' || better === 'down' ? better : null
		};
		delete next.children;
		const children = keepChildren(next, form.getAll(`children:${key}`));
		rows.push(children.length > 0 ? { ...next, children } : next);
	});

	const [op, at] = String(form.get('op') ?? '').split(':');
	const i = Number(at);
	if (op === 'add') {
		return { rows: addTrend(rows, String(form.get('add') ?? '')) };
	}
	if (op === 'remove' && rows[i]) {
		rows.splice(i, 1);
	} else if ((op === 'up' || op === 'down') && rows[i]) {
		const j = op === 'up' ? i - 1 : i + 1;
		if (rows[j]) [rows[i], rows[j]] = [rows[j], rows[i]];
	}

	return { rows };
}

/** Appends one metric, if the type supports it and the list does not have it yet. */
export function addTrend(current: TrendConfigRow[], key: string): TrendConfigRow[] {
	const type = key.split(':')[0];
	const row = trendsFor(type).find((candidate) => trendKey(candidate) === key);
	if (!row || current.some((existing) => trendKey(existing) === key)) {
		return current;
	}
	return [...current, row];
}

/**
 * Applies a type page's switches: its unticked rows leave the list, newly
 * ticked ones join the end, and every other row stays where it was.
 */
export function setTypeTrends(
	current: TrendConfigRow[],
	typeId: string,
	ticked: readonly string[],
	/** "parentKey>childField" for each ticked sub-row. */
	tickedChildren: readonly string[] = []
): TrendConfigRow[] {
	const wanted = new Set(ticked);
	const withChildren = (row: TrendConfigRow): TrendConfigRow => {
		const prefix = `${trendKey(row)}>`;
		const next: TrendConfigRow = { ...row };
		delete next.children;
		const children = keepChildren(
			next,
			tickedChildren.filter((key) => key.startsWith(prefix)).map((key) => key.slice(prefix.length))
		);
		return children.length > 0 ? { ...next, children } : next;
	};
	const kept = current
		.filter((row) => row.type !== typeId || wanted.has(trendKey(row)))
		.map((row) => (row.type === typeId ? withChildren(row) : row));
	const have = new Set(kept.map(trendKey));
	const added = trendsFor(typeId)
		.filter((row) => wanted.has(trendKey(row)) && !have.has(trendKey(row)))
		.map(withChildren);
	return [...kept, ...added];
}

/** Whether two lists say the same thing, so an untouched form writes nothing. */
export function sameTrends(a: TrendConfigRow[], b: TrendConfigRow[]): boolean {
	return JSON.stringify(a) === JSON.stringify(b);
}
