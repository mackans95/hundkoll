<script lang="ts">
	import StackedColumns from '$lib/components/charts/StackedColumns.svelte';
	import ChartLegend, { type LegendItem } from '$lib/components/ChartLegend.svelte';
	import FoldableCard from '$lib/components/FoldableCard.svelte';
	import TileGrid from '$lib/components/TileGrid.svelte';
	import * as locale from '$lib/locale';
	import { aloneBuckets } from '$lib/stats/buckets';
	import type { OutcomeDay } from '$lib/stats/outcomes';
	import { aloneColors, type ChartColor } from '$lib/stats/palette';
	import type { Tile } from '$lib/stats/summary';

	let {
		outcomes,
		today,
		tiles,
		color
	}: {
		outcomes: OutcomeDay[];
		today: string;
		tiles: Tile[];
		color: ChartColor;
	} = $props();

	const words = locale.stats.alone;
	const colors = $derived(aloneColors(color));
	const buckets = $derived(aloneBuckets(outcomes, today, colors));

	// Vet ej only earns a legend entry once one exists, as the meal card's unknown does.
	const hasUnknown = $derived(buckets.some((bucket) => bucket.segments[2] > 0));
	const legend = $derived<LegendItem[]>([
		{ color: colors[0], label: words.legendCalm },
		{ color: colors[1], label: words.legendAnxious },
		...(hasUnknown ? [{ color: colors[2], label: words.legendUnknown }] : [])
	]);
</script>

<FoldableCard title={words.heading}>
	<StackedColumns
		{buckets}
		{colors}
		label={words.heading}
	/>
	<ChartLegend items={legend} />
	{#if tiles.length > 0}
		<TileGrid {tiles} />
	{/if}
</FoldableCard>
