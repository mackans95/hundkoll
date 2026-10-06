<script lang="ts">
	import StackedColumns from '$lib/components/charts/StackedColumns.svelte';
	import * as locale from '$lib/locale';
	import FoldableCard from '$lib/components/FoldableCard.svelte';
	import StatTile from '$lib/components/StatTile.svelte';
	import { walkBuckets } from '$lib/stats/buckets';
	import type { ChartColor } from '$lib/stats/palette';
	import { walkTiles } from '$lib/stats/summary';
	import type { StatSummary, WalkDay } from '$lib/types/domain';

	let {
		days,
		summary,
		today,
		color
	}: { days: WalkDay[]; summary: StatSummary | null; today: string; color: ChartColor } = $props();

	const buckets = $derived(walkBuckets(days, today, color.main));
	const tiles = $derived(walkTiles(summary));
</script>

<FoldableCard title={locale.stats.walks.heading}>
	<StackedColumns
		{buckets}
		colors={[color.main]}
		label={locale.stats.walks.heading}
	/>
	<div class="flex flex-col gap-2">
		<!-- Walks per day is the headline, so it gets the full width. -->
		<StatTile tile={tiles[0]} />
		<div class="grid grid-cols-2 gap-2">
			{#each tiles.slice(1) as tile (tile.label)}
				<StatTile {tile} />
			{/each}
		</div>
	</div>
</FoldableCard>
