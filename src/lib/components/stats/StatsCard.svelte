<script lang="ts">
	import ChartLegend from '$lib/components/ChartLegend.svelte';
	import FoldableCard from '$lib/components/FoldableCard.svelte';
	import StackedColumns from '$lib/components/charts/StackedColumns.svelte';
	import TrendLine from '$lib/components/charts/TrendLine.svelte';
	import TabBar, { type Tab } from '$lib/components/TabBar.svelte';
	import TileGrid from '$lib/components/TileGrid.svelte';
	import * as locale from '$lib/locale';
	import type { CardView } from '$lib/stats/cardView';
	import type { Period } from '$lib/types/domain';

	// Any type's card, from its configuration (plan 29b): bars or a timeline,
	// then its tiles. The page owns the period, which every tabbed card shares.
	let {
		view,
		period,
		tabs,
		tabHref
	}: {
		view: CardView;
		period: Period;
		tabs: Tab<Period>[];
		tabHref: (value: Period) => string;
	} = $props();

	const chart = $derived(view.chart);
</script>

<FoldableCard title={view.heading}>
	{#snippet aside()}
		{#if chart.kind === 'timeline' && chart.latest}
			<!-- The header's own size, so this header is as tall as every other card's. -->
			<span class="font-bold">{chart.latest}</span>
		{/if}
	{/snippet}

	{#if chart.kind === 'bars'}
		{#if chart.picker}
			<TabBar
				{tabs}
				current={period}
				href={tabHref}
				label={locale.stats.periodPickerLabel}
			/>
		{/if}
		{#if chart.ready}
			<StackedColumns
				buckets={chart.buckets}
				colors={chart.colors}
				label={view.heading}
				emptyText={chart.empty}
			/>
			{#if chart.legend.length > 0}
				<ChartLegend items={chart.legend} />
			{/if}
		{:else}
			<!-- An unfinished period would read as a complete one, so the chart waits. -->
			<p class="py-6 text-center text-sm text-ink-muted">{chart.pending}</p>
		{/if}
	{:else if chart.points.length === 0}
		<p class="text-sm text-ink-muted">{chart.empty}</p>
	{:else}
		<TrendLine
			points={chart.points}
			color={chart.color}
			unit={chart.unit}
			label={view.heading}
		/>
	{/if}

	{#if view.tiles.length > 0}
		<TileGrid tiles={view.tiles} />
	{/if}
</FoldableCard>
