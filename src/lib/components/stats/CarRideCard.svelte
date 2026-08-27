<script lang="ts">
	import StackedColumns from '$lib/components/charts/StackedColumns.svelte';
	import * as locale from '$lib/locale';
	import FoldableCard from '$lib/components/FoldableCard.svelte';
	import StatTile from '$lib/components/StatTile.svelte';
	import * as format from '$lib/format';
	import { metricFor, totalEvents } from '$lib/stats/metrics';
	import { avgTile, shareTile } from '$lib/stats/summary';
	import { simpleCountBuckets } from '$lib/stats/buckets';
	import { CAR_RIDE_COLOR } from '$lib/stats/palette';
	import type { DetailDayCount, DetailMetric, SimpleDay } from '$lib/types/domain';

	// metrics and detailDays are optional so a card can gain tiles or a tooltip
	// breakdown later without the page having to pass anything until it does —
	// see the metric kinds in scripts/new-event-core.ts.
	let {
		days,
		today,
		metrics = [],
		detailDays = []
	}: {
		days: SimpleDay[];
		today: string;
		metrics?: DetailMetric[];
		detailDays?: DetailDayCount[];
	} = $props();

	const buckets = $derived(
		simpleCountBuckets(days, today, locale.stats.carRide.tooltipLabel, CAR_RIDE_COLOR, {
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
		colors={[CAR_RIDE_COLOR]}
		label={locale.stats.carRide.heading}
	/>
	<div class="grid grid-cols-2 gap-2">
		{#each tiles as tile (tile.label)}
			<StatTile {tile} />
		{/each}
	</div>
</FoldableCard>
