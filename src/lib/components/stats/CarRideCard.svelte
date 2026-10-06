<script lang="ts">
	import StackedColumns from '$lib/components/charts/StackedColumns.svelte';
	import * as locale from '$lib/locale';
	import FoldableCard from '$lib/components/FoldableCard.svelte';
	import TileGrid from '$lib/components/TileGrid.svelte';
	import type { Tile } from '$lib/stats/summary';
	import { simpleCountBuckets } from '$lib/stats/buckets';
	import type { DetailDayCount, SimpleDay } from '$lib/types/domain';

	// tiles and detailDays are optional so a card can gain tiles or a tooltip
	// breakdown later without the page having to pass anything until it does —
	// see the metric kinds in scripts/new-event-core.ts.
	let {
		days,
		today,
		tiles = [],
		detailDays = [],
		color
	}: {
		days: SimpleDay[];
		today: string;
		tiles?: Tile[];
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
</script>

<FoldableCard title={locale.stats.carRide.heading}>
	<StackedColumns
		{buckets}
		colors={[color]}
		label={locale.stats.carRide.heading}
	/>
	{#if tiles.length > 0}
		<TileGrid {tiles} />
	{/if}
</FoldableCard>
