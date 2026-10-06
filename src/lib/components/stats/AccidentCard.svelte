<script lang="ts">
	import StackedColumns from '$lib/components/charts/StackedColumns.svelte';
	import * as locale from '$lib/locale';
	import ChartLegend, { type LegendItem } from '$lib/components/ChartLegend.svelte';
	import FoldableCard from '$lib/components/FoldableCard.svelte';
	import TileGrid from '$lib/components/TileGrid.svelte';
	import TabBar, { type Tab } from '$lib/components/TabBar.svelte';
	import { accidentBuckets } from '$lib/stats/buckets';
	import { accidentColors, type ChartColor } from '$lib/stats/palette';
	import { periodReady, type Tile } from '$lib/stats/summary';
	import type { AccidentBin, Period } from '$lib/types/domain';

	let {
		bins,
		period,
		tiles,
		tracked,
		today,
		tabs,
		tabHref,
		color
	}: {
		bins: AccidentBin[];
		period: Period;
		tiles: Tile[];
		/** Days tracked: the week and month charts wait for a full one. */
		tracked: number;
		today: string;
		tabs: Tab<Period>[];
		tabHref: (value: Period) => string;
		color: ChartColor;
	} = $props();

	const colors = $derived(accidentColors(color));

	const buckets = $derived(accidentBuckets(bins, period, today));
	const ready = $derived(periodReady(period, tracked));

	const hasUnspecified = $derived(buckets.some((bucket) => bucket.segments[2] > 0));
	const legend = $derived<LegendItem[]>([
		{ color: colors[0], label: locale.stats.accidents.legendPee },
		{ color: colors[1], label: locale.stats.accidents.legendPoop },
		...(hasUnspecified
			? [{ color: colors[2], label: locale.stats.accidents.legendUnspecified }]
			: [])
	]);
</script>

<FoldableCard title={locale.stats.accidents.heading}>
	<TabBar
		{tabs}
		current={period}
		href={tabHref}
		label={locale.stats.periodPickerLabel}
	/>

	{#if ready}
		<StackedColumns
			{buckets}
			{colors}
			label={locale.stats.accidents.heading}
			emptyText={locale.stats.accidents.empty}
		/>
		<ChartLegend items={legend} />
	{:else}
		<!-- An unfinished period would read as a complete one, so the chart waits. -->
		<p class="py-6 text-center text-sm text-ink-muted">
			{locale.stats.accidents.pending(period)}
		</p>
	{/if}

	{#if tiles.length > 0}
		<TileGrid {tiles} />
	{/if}
</FoldableCard>
