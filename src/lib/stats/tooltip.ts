// A chart tooltip's configured details (plan 29b), shared by bars and
// timelines: the same ordered checklist, read from whatever one column, one
// period or one event can say. A source that can't answer a detail leaves it out.

import * as format from '$lib/format';
import * as locale from '$lib/locale';
import { fieldsFor, shortFieldLabel, type DetailField } from '$lib/events/fields';
import type { TooltipCell, TooltipRow } from '$lib/types/charts';

/** What one column, period or event can tell a tooltip. */
export type DetailSource = {
	/** How many events it holds; null for a single event, where a count says nothing. */
	n: number | null;
	/** The average time between them, as written; undefined where there is no such thing. */
	gap?: string;
	/** A number field's value as written: an average, or the event's own. Null leaves it out. */
	avg: (field: DetailField) => string | null;
	/** How many times a counted field happened. */
	count: (field: DetailField) => number;
	/** What a counted field revealed, boxed under its row. */
	causes: (field: DetailField) => { label: string; n: number }[];
	/** How often a checkbox or outcome was yes; null leaves it out. */
	share: (field: DetailField) => number | null;
	/** A count split's own cells by field, drawn where the field's detail sits. */
	split?: { cells: Map<string, TooltipCell>; rest: TooltipCell | null };
};

export type DetailOptions = {
	typeId: string;
	details: string[];
	emoji: boolean;
	/** The type's emoji, for its count in emoji mode. */
	icon: string | null;
	/** The type's count in words: "Promenader". */
	label: string;
	/** The count's dot in words mode, standing in for a legend entry. */
	color: string;
	/** Details already shown elsewhere in the tooltip: a timeline's plotted value. */
	skip?: Set<string>;
};

function cell(label: string, value: string, color?: string): TooltipCell {
	return color === undefined ? { label, value } : { label, value, color };
}

/** A count labelled by an emoji, sized up so the emoji reads at a glance. */
export function countCell(label: string, count: number): TooltipCell {
	return { label, value: String(count), big: true };
}

/**
 * Cells into rows: three emoji counts fit side by side, but a cell with words
 * takes room, so a row holding one has two at most. Keeps the tooltip narrow.
 */
export function packCells(cells: TooltipCell[]): TooltipCell[][] {
	const rows: TooltipCell[][] = [];
	for (const next of cells) {
		const row = rows.at(-1);
		const fits = row !== undefined && row.length < (row.every((c) => c.big) && next.big ? 3 : 2);
		if (fits) row.push(next);
		else rows.push([next]);
	}
	return rows;
}

/** Whether a counted field is drawn as its own row, causes boxed under it, rather than an emoji in line. */
export function countAsRow(emoji: boolean, field: DetailField | undefined): boolean {
	return !(emoji && field?.symbol);
}

/** The configured details, in order, as tooltip rows. */
export function detailRows(options: DetailOptions, source: DetailSource): TooltipRow[] {
	const { typeId, emoji } = options;
	const fields = fieldsFor(typeId);
	const byName = (name: string | undefined) => fields.find((field) => field.name === name);
	const rows: TooltipRow[] = [];
	let line: TooltipCell[] = [];
	const flush = () => {
		rows.push(...packCells(line));
		line = [];
	};

	// A count split's cells go where their fields' details sit, the rest after
	// the last of them; any field not in the list leads.
	const split = source.split;
	const placed = new Set(
		options.details.flatMap((key) => {
			const [kind, name] = key.split(':');
			return kind === 'count' && name && split?.cells.has(name) ? [name] : [];
		})
	);
	if (split) {
		for (const [name, splitCell] of split.cells) if (!placed.has(name)) line.push(splitCell);
		if (placed.size === 0 && split.rest) line.push(split.rest);
	}
	const lastPlaced = [...placed].at(-1);

	for (const key of options.details) {
		if (options.skip?.has(key)) continue;
		const [kind, name] = key.split(':');
		const field = byName(name);
		if (kind === 'count' && !name) {
			if (source.n === null) continue;
			line.push(
				emoji && options.icon
					? countCell(options.icon, source.n)
					: cell(options.label, String(source.n), options.color)
			);
		} else if (kind === 'gap') {
			if (source.gap !== undefined) line.push(cell(locale.stats.walks.between, source.gap));
		} else if (kind === 'avg' && field) {
			const value = source.avg(field);
			if (value !== null) line.push(cell(shortFieldLabel(field.label), value));
		} else if (kind === 'count' && field) {
			if (split?.cells.has(field.name)) {
				line.push(split.cells.get(field.name)!);
				if (field.name === lastPlaced && split.rest) line.push(split.rest);
				continue;
			}
			const counted = source.count(field);
			if (!countAsRow(emoji, field)) {
				line.push(countCell(field.symbol!, counted));
			} else if (counted > 0) {
				flush();
				rows.push([cell(`${shortFieldLabel(field.label)}:`, String(counted))]);
				const causes = source.causes(field);
				if (causes.length > 0) {
					rows.push({ nested: [causes.map((cause) => cell(cause.label, String(cause.n)))] });
				}
			}
		} else if (kind === 'share' && field) {
			const share = source.share(field);
			if (share !== null) line.push(cell(locale.stats.meals.share, format.percentageText(share)));
		}
	}
	flush();
	return rows;
}
