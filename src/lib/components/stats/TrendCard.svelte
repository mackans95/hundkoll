<script lang="ts">
	import FoldableCard from '$lib/components/FoldableCard.svelte';
	import * as locale from '$lib/locale';
	import TabBar, { type Tab } from '$lib/components/TabBar.svelte';
	import { trendCaption, trendPending, type TrendRow, type TrendTone } from '$lib/stats/trends';
	import type { Period } from '$lib/types/domain';

	let {
		period,
		rows,
		complete,
		prevBucket,
		latestBucket,
		tabs,
		tabHref
	}: {
		period: Period;
		rows: TrendRow[];
		complete: boolean;
		prevBucket: string;
		latestBucket: string;
		tabs: Tab<Period>[];
		tabHref: (value: Period) => string;
	} = $props();

	// Status's badge colours, and a mark beside them so better and worse never rest on hue.
	const BADGE: Record<TrendTone, string> = {
		better: 'bg-success-badge text-success-ink',
		worse: 'bg-warn-badge text-warn-ink',
		neutral: 'bg-surface-hover text-ink-label'
	};
	const words = locale.stats.trends;
</script>

<FoldableCard title={locale.stats.trends.heading}>
	<p class="text-sm text-ink-muted">{trendCaption(period, prevBucket, latestBucket)}</p>
	<TabBar
		{tabs}
		current={period}
		href={tabHref}
		label={locale.stats.trendPickerLabel}
	/>

	{#if rows.length === 0}
		<p class="py-6 text-center text-sm text-ink-muted">{words.empty}</p>
	{:else if complete}
		<ul class="divide-y divide-edge-soft">
			{#each rows as row (row.key)}
				<li class="flex items-center gap-2 py-2">
					<span class="text-sm font-medium">{row.label}</span>
					<span class="ml-auto text-sm text-ink-muted">{row.from} → {row.to}</span>
					<span
						class="w-20 shrink-0 rounded-full px-1 py-0.5 text-center text-xs font-semibold {BADGE[
							row.tone
						]}"
					>
						{row.badge}
						{#if row.tone !== 'neutral'}
							<span aria-hidden="true">{words.mark[row.tone]}</span>
							<span class="sr-only">{words.toneName[row.tone]}</span>
						{/if}
					</span>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="py-6 text-center text-sm text-ink-muted">{trendPending(period)}</p>
	{/if}
</FoldableCard>
