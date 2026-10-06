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
		...fieldsFor(typeId).map((field): TrendConfigRow => ({
			type: typeId,
			kind: field.input === 'number' ? 'avg' : 'share',
			field: field.name,
			better: null
		}))
	];
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
		const { type, kind, field, better, label } = item as Record<string, unknown>;
		if (typeof type !== 'string' || !knownTypes.has(type)) continue;

		const supported = trendsFor(type).find(
			(row) => row.kind === kind && (row.field ?? null) === (field ?? null)
		);
		if (!supported || seen.has(trendKey(supported))) continue;
		seen.add(trendKey(supported));

		rows.push({
			...supported,
			better: better === 'up' || better === 'down' ? better : null,
			...(typeof label === 'string' && label !== '' ? { label } : {})
		});
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

/** The metric alone, for a list already headed by its type: "antal", "Kiss", "Lugn". */
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
		rows.push({ ...row, better: better === 'up' || better === 'down' ? better : null });
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
	ticked: readonly string[]
): TrendConfigRow[] {
	const wanted = new Set(ticked);
	const kept = current.filter((row) => row.type !== typeId || wanted.has(trendKey(row)));
	const have = new Set(kept.map(trendKey));
	const added = trendsFor(typeId).filter(
		(row) => wanted.has(trendKey(row)) && !have.has(trendKey(row))
	);
	return [...kept, ...added];
}

/** Whether two lists say the same thing, so an untouched form writes nothing. */
export function sameTrends(a: TrendConfigRow[], b: TrendConfigRow[]): boolean {
	return JSON.stringify(a) === JSON.stringify(b);
}
