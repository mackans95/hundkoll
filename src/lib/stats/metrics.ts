// Finding one detail field's metrics among a type's rows.
//
// stats_detail_metrics is long — a row per field — so a card holding "the
// metrics for this type" has to pick the field it wants. Absent is a real
// answer: a field nobody has ever logged has no row at all, and the tile
// builders in summary.ts decide what that means per metric.

import type { DetailMetric, SimpleDay } from '$lib/types/domain';

/**
 * The row for one field, or null when the field has never been logged.
 * (rows, 'duration_min') → that row, (rows, 'accident') → null if never once
 */
export function metricFor(metrics: DetailMetric[], field: string): DetailMetric | null {
	return metrics.find((metric) => metric.field === field) ?? null;
}

/**
 * How many events the window holds, from the same daily counts the chart is
 * drawn from. A share needs this only when its field has no row at all: with no
 * row there is nothing to say how many events there were, and "she has never
 * been sick in the car" and "no rides logged" are different answers.
 */
export function totalEvents(days: SimpleDay[]): number {
	return days.reduce((total, day) => total + day.n, 0);
}
