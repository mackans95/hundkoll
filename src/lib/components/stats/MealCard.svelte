<script lang="ts">
	import StackedColumns from '$lib/components/charts/StackedColumns.svelte';
	import * as locale from '$lib/locale';
	import ChartLegend, { type LegendItem } from '$lib/components/ChartLegend.svelte';
	import FoldableCard from '$lib/components/FoldableCard.svelte';
	import TileGrid from '$lib/components/TileGrid.svelte';
	import { mealBuckets } from '$lib/stats/buckets';
	import { mealColors, type ChartColor } from '$lib/stats/palette';
	import type { Tile } from '$lib/stats/summary';
	import type { MealDay } from '$lib/types/domain';

	let {
		days,
		tiles,
		today,
		color
	}: { days: MealDay[]; tiles: Tile[]; today: string; color: ChartColor } = $props();

	const colors = $derived(mealColors(color));

	const buckets = $derived(mealBuckets(days, today, color.main));

	// Meals logged by a quick tap say nothing about finishing, so the third
	// colour only earns a legend entry once one exists.
	const hasUnknown = $derived(buckets.some((bucket) => bucket.segments[2] > 0));
	const legend = $derived<LegendItem[]>([
		{ color: colors[0], label: locale.stats.meals.legendFinished },
		{ color: colors[1], label: locale.stats.meals.legendNotFinished },
		...(hasUnknown ? [{ color: colors[2], label: locale.stats.meals.legendUnknown }] : [])
	]);
</script>

<FoldableCard title={locale.stats.meals.heading}>
	<StackedColumns
		{buckets}
		{colors}
		label={locale.stats.meals.heading}
	/>
	<ChartLegend items={legend} />
	{#if tiles.length > 0}
		<TileGrid {tiles} />
	{/if}
</FoldableCard>
