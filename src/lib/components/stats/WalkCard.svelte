<script lang="ts">
	import StackedColumns from '$lib/components/charts/StackedColumns.svelte';
	import * as locale from '$lib/locale';
	import FoldableCard from '$lib/components/FoldableCard.svelte';
	import TileGrid from '$lib/components/TileGrid.svelte';
	import { walkBuckets } from '$lib/stats/buckets';
	import type { ChartColor } from '$lib/stats/palette';
	import type { Tile } from '$lib/stats/summary';
	import type { WalkDay } from '$lib/types/domain';

	let {
		days,
		tiles,
		today,
		color
	}: { days: WalkDay[]; tiles: Tile[]; today: string; color: ChartColor } = $props();

	const buckets = $derived(walkBuckets(days, today, color.main));
</script>

<FoldableCard title={locale.stats.walks.heading}>
	<StackedColumns
		{buckets}
		colors={[color.main]}
		label={locale.stats.walks.heading}
	/>
	{#if tiles.length > 0}
		<TileGrid {tiles} />
	{/if}
</FoldableCard>
