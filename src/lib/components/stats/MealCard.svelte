<script lang="ts">
	import StackedColumns from '$lib/components/charts/StackedColumns.svelte';
	import ChartLegend, { type LegendItem } from '$lib/components/ChartLegend.svelte';
	import FoldableCard from '$lib/components/FoldableCard.svelte';
	import StatTile from '$lib/components/StatTile.svelte';
	import { mealBuckets } from '$lib/stats/buckets';
	import { MEAL_COLORS } from '$lib/stats/palette';
	import { mealTiles } from '$lib/stats/summary';
	import type { MealDay, StatSummary } from '$lib/types/domain';

	let { days, summary, today }: { days: MealDay[]; summary: StatSummary | null; today: string } =
		$props();

	const buckets = $derived(mealBuckets(days, today));
	const tiles = $derived(mealTiles(summary));

	// Meals logged by a quick tap say nothing about finishing, so the third
	// colour only earns a legend entry once one exists.
	const hasUnknown = $derived(buckets.some((bucket) => bucket.segments[2] > 0));
	const legend = $derived<LegendItem[]>([
		{ color: MEAL_COLORS[0], label: 'Åt upp' },
		{ color: MEAL_COLORS[1], label: 'Åt inte upp' },
		...(hasUnknown ? [{ color: MEAL_COLORS[2], label: 'Okänt' }] : [])
	]);
</script>

<FoldableCard title="🍽️ Mat">
	<StackedColumns {buckets} colors={MEAL_COLORS} />
	<ChartLegend items={legend} />
	<div class="grid grid-cols-2 gap-2">
		{#each tiles as tile (tile.label)}
			<StatTile {tile} />
		{/each}
	</div>
</FoldableCard>
