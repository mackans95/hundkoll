<script lang="ts">
	import StackedColumns from '$lib/components/charts/StackedColumns.svelte';
	import * as locale from '$lib/locale';
	import FoldableCard from '$lib/components/FoldableCard.svelte';
	import TileGrid from '$lib/components/TileGrid.svelte';
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
	<TileGrid {tiles} />
</FoldableCard>
