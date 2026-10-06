// Turning view rows into chart columns: pure functions, rows in, columns out.
// Every builder zero-fills its window first — a gap in the chart has to mean
// "nothing happened", not "no row".

import type { ColumnBucket, TooltipCell } from '$lib/types/charts';
import { fieldsFor, fieldsRevealedBy, shortFieldLabel, type DetailField } from '$lib/events/fields';
import { dayBreakdown, dayMeans } from './detailDays';
import * as locale from '$lib/locale';
import * as format from '$lib/format';
import * as time from '$lib/time';
import type { DetailDayCount, Period, SimpleDay } from '$lib/types/domain';
import type { Mean, OutcomeDay } from './outcomes';

// Window widths and tick spacing, shared so the charts line up with each other.
const DAILY_WINDOW = 30;
const PERIOD_COLUMNS = 12;
const DAY_TICK_EVERY = 7;
const PERIOD_TICK_EVERY = 3;

/**
 * A number field's day as its own summary of the mean, rounded to the field's
 * step: "30 min" for one event, "~32 min" for several.
 */
function meanText(field: DetailField, sum: number, n: number): string {
	const decimals = field.step?.split('.')[1]?.length ?? 0;
	const mean = Number((sum / n).toFixed(decimals));
	const text = field.summarize?.(mean) ?? format.swedishNumber(mean);
	return n > 1 ? locale.units.approximately(text) : text;
}

/** A tooltip cell; coloured when it stands in for a legend entry. */
function cell(label: string, value: string, color?: string): TooltipCell {
	return color === undefined ? { label, value } : { label, value, color };
}

/** A count labelled by an emoji, sized up so the emoji reads at a glance. */
function countCell(label: string, count: number): TooltipCell {
	return { label, value: String(count), big: true };
}

/** A tooltip row, with the cells that had nothing to say left out. */
function tooltipRow(...cells: (TooltipCell | null)[]): TooltipCell[] {
	return cells.filter((c): c is TooltipCell => c !== null);
}

/**
 * Builds plain count-per-day columns for the last 30 days — the shared
 * builder generated stats cards call, so each new type does not grow a
 * bespoke one. `label` names the count in the tooltip.
 */
export function simpleCountBuckets(
	days: SimpleDay[],
	today: string,
	label: string,
	color: string,
	/**
	 * What to break each day's bar down by, when the type collects anything
	 * countable: its own detail counts, plus the type they belong to so the
	 * captions come from the catalogue rather than being passed in.
	 */
	breakdown?: { typeId: string; counts: DetailDayCount[] }
): ColumnBucket[] {
	const byDay = new Map(days.map((day) => [day.day, day.n]));
	const fields = breakdown ? fieldsFor(breakdown.typeId) : [];

	return time.lastDays(today, DAILY_WINDOW).map((day, i) => {
		const n = byDay.get(day) ?? 0;
		// Only what actually happened: a quiet day says the count and stops,
		// rather than listing every field as a zero.
		const groups = breakdown ? dayBreakdown(breakdown.counts, fields, day) : [];
		const means = breakdown && n > 0 ? dayMeans(breakdown.counts, fields, day) : [];

		return {
			label: format.dayLabel(day),
			tick: i % DAY_TICK_EVERY === 0,
			segments: [n],
			tooltip: {
				heading: format.dayLabel(day),
				// Like the walk tooltip: the count and the day's means first, then
				// each field that happened with what it revealed boxed under it.
				rows: [
					tooltipRow(
						cell(label, String(n), color),
						...means.map(({ field, sum, n: answered }) =>
							cell(shortFieldLabel(field.label), meanText(field, sum, answered))
						)
					),
					...groups.flatMap((group) => [
						tooltipRow(cell(`${shortFieldLabel(group.label)}:`, String(group.n))),
						...(group.children.length > 0
							? [
									{
										nested: [
											tooltipRow(
												...group.children.map((child) => cell(child.label, String(child.n)))
											)
										]
									}
								]
							: [])
					])
				]
			}
		};
	});
}
