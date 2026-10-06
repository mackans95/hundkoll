<script lang="ts">
	import StackedColumns from '$lib/components/charts/StackedColumns.svelte';
	import ChartLegend, { type LegendItem } from '$lib/components/ChartLegend.svelte';
	import FoldableCard from '$lib/components/FoldableCard.svelte';
	import StatTile from '$lib/components/StatTile.svelte';
	import * as format from '$lib/format';
	import * as locale from '$lib/locale';
	import { aloneBuckets } from '$lib/stats/buckets';
	import { metricFor } from '$lib/stats/metrics';
	import { answeredShare, type OutcomeDay } from '$lib/stats/outcomes';
	import { aloneColors, type ChartColor } from '$lib/stats/palette';
	import { avgTile, minutesTile, shareValueTile } from '$lib/stats/summary';
	import type { DetailMetric } from '$lib/types/domain';

	let {
		outcomes,
		today,
		metrics,
		longestCalm,
		color
	}: {
		outcomes: OutcomeDay[];
		today: string;
		metrics: DetailMetric[];
		longestCalm: number | null;
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

	const tiles = $derived([
		avgTile(words.avgDurationMin, metricFor(metrics, 'duration_min'), format.minutesText),
		shareValueTile(words.calmShare, answeredShare(outcomes)),
		avgTile(words.avgAnxiousAfterMin, metricFor(metrics, 'anxious_after_min'), format.minutesText),
		minutesTile(words.longestCalm, longestCalm)
	]);
</script>

<FoldableCard title={words.heading}>
	<StackedColumns
		{buckets}
		{colors}
		label={words.heading}
	/>
	<ChartLegend items={legend} />
	<div class="grid grid-cols-2 gap-2">
		{#each tiles as tile (tile.label)}
			<StatTile {tile} />
		{/each}
	</div>
</FoldableCard>
