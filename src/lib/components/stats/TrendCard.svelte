<script lang="ts">
	import FoldableCard from '$lib/components/FoldableCard.svelte';
	import * as locale from '$lib/locale';
	import TabBar, { type Tab } from '$lib/components/TabBar.svelte';
	import { buildTrendRows, trendCaption, trendPending } from '$lib/stats/trends';
	import type { Period, TrendBucket } from '$lib/types/domain';

	let {
		period,
		prev,
		latest,
		prevBucket,
		latestBucket,
		tabs,
		tabHref
	}: {
		period: Period;
		prev: TrendBucket | null;
		latest: TrendBucket | null;
		prevBucket: string;
		latestBucket: string;
		tabs: Tab<Period>[];
		tabHref: (value: Period) => string;
	} = $props();

	const rows = $derived(buildTrendRows(prev, latest));
	const complete = $derived(prev !== null && latest !== null);
</script>

<FoldableCard title={locale.stats.trends.heading}>
	<p class="text-sm text-gray-500">{trendCaption(period, prevBucket, latestBucket)}</p>
	<TabBar
		{tabs}
		current={period}
		href={tabHref}
		label={locale.stats.trendPickerLabel}
	/>

	{#if complete}
		<ul class="divide-y divide-gray-100">
			{#each rows as row (row.label)}
				<li class="flex items-center gap-2 py-2">
					<span class="text-sm font-medium">{row.label}</span>
					<span class="ml-auto text-sm text-gray-500">{row.from} → {row.to}</span>
					<!-- Neutral badge: whether "more" is good depends on the metric. -->
					<span
						class="w-16 shrink-0 rounded-full bg-gray-100 px-1 py-0.5 text-center text-xs font-semibold text-gray-700"
					>
						{row.badge}
					</span>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="py-6 text-center text-sm text-gray-500">{trendPending(period)}</p>
	{/if}
</FoldableCard>
