<script lang="ts">
	import StackedColumns from '$lib/components/charts/StackedColumns.svelte';
	import * as locale from '$lib/locale';
	import FoldableCard from '$lib/components/FoldableCard.svelte';
	import StatTile from '$lib/components/StatTile.svelte';
	import * as format from '$lib/format';
	import { metricFor, totalEvents } from '$lib/stats/metrics';
	import { avgTile, shareTile } from '$lib/stats/summary';
	import { simpleCountBuckets } from '$lib/stats/buckets';
	import type { DetailDayCount, DetailMetric, SimpleDay } from '$lib/types/domain';

	// metrics and detailDays are optional so a card can gain tiles or a tooltip
	// breakdown later without the page having to pass anything until it does —
	// see the metric kinds in scripts/new-event-core.ts.
	let {
		days,
		today,
		metrics = [],
		detailDays = [],
		color
	}: {
		days: SimpleDay[];
		today: string;
		metrics?: DetailMetric[];
		detailDays?: DetailDayCount[];
		/** The type's main colour, as Settings chose it. */
		color: string;
	} = $props();

	const buckets = $derived(
		simpleCountBuckets(days, today, locale.stats.carRide.tooltipLabel, color, {
			typeId: 'car_ride',
			counts: detailDays
		})
	);

	const tiles = $derived([
		avgTile(
			locale.stats.carRide.avgDurationMin,
			metricFor(metrics, 'duration_min'),
			format.minutesText
		),
		shareTile(
			locale.stats.carRide.withoutAccident,
			metricFor(metrics, 'accident'),
			totalEvents(days),
			true
		)
	]);
</script>

<FoldableCard title={locale.stats.carRide.heading}>
	<StackedColumns
		{buckets}
		colors={[color]}
		label={locale.stats.carRide.heading}
	/>
	<div class="grid grid-cols-2 gap-2">
		{#each tiles as tile (tile.label)}
			<StatTile {tile} />
		{/each}
	</div>
</FoldableCard>
