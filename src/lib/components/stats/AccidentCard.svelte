<script lang="ts">
	import StackedColumns from '$lib/components/charts/StackedColumns.svelte';
	import ChartLegend, { type LegendItem } from '$lib/components/ChartLegend.svelte';
	import FoldableCard from '$lib/components/FoldableCard.svelte';
	import StatTile from '$lib/components/StatTile.svelte';
	import TabBar, { type Tab } from '$lib/components/TabBar.svelte';
	import { accidentBuckets } from '$lib/stats/buckets';
	import { ACCIDENT_COLORS } from '$lib/stats/palette';
	import { accidentTiles, periodReady } from '$lib/stats/summary';
	import type { AccidentBin, Period, StatSummary } from '$lib/types/domain';

	let {
		bins,
		period,
		summary,
		tracked,
		today,
		tabs,
		tabHref
	}: {
		bins: AccidentBin[];
		period: Period;
		summary: StatSummary | null;
		tracked: number;
		today: string;
		tabs: Tab<Period>[];
		tabHref: (value: Period) => string;
	} = $props();

	const buckets = $derived(accidentBuckets(bins, period, today));
	const tiles = $derived(accidentTiles(summary, tracked));
	const ready = $derived(periodReady(period, tracked));

	const hasUnspecified = $derived(buckets.some((bucket) => bucket.segments[2] > 0));
	const legend = $derived<LegendItem[]>([
		{ color: ACCIDENT_COLORS[0], label: 'Kiss' },
		{ color: ACCIDENT_COLORS[1], label: 'Bajs' },
		...(hasUnspecified ? [{ color: ACCIDENT_COLORS[2], label: 'Ospecificerat' }] : [])
	]);
</script>

<FoldableCard title="⚠️ Olyckor">
	<TabBar {tabs} current={period} href={tabHref} label="Periodval" />

	{#if ready}
		<StackedColumns {buckets} colors={ACCIDENT_COLORS} />
		<ChartLegend items={legend} />
	{:else}
		<!-- A bar for a period that has not finished yet would read as a
		     complete one, so the chart waits rather than showing a stub. -->
		<p class="py-6 text-center text-sm text-gray-500">
			{period === 'week'
				? 'Veckovyn visas när en hel vecka har spårats.'
				: 'Månadsvyn visas när en hel månad har spårats.'}
		</p>
	{/if}

	<div class="grid grid-cols-3 gap-2">
		{#each tiles as tile (tile.label)}
			<StatTile {tile} />
		{/each}
	</div>
</FoldableCard>
