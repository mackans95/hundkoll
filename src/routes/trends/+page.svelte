<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import TabBar, { type Tab } from '$lib/components/TabBar.svelte';
	import TrendTile from '$lib/components/stats/TrendTile.svelte';
	import * as locale from '$lib/locale';
	import { bucketLabel, trendCaption, trendPending } from '$lib/stats/trends';
	import * as format from '$lib/format';
	import type { Period } from '$lib/types/domain';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const words = locale.stats.trends;
	const tabs: Tab<Period>[] = [
		{ value: 'day', label: locale.stats.periods.day },
		{ value: 'week', label: locale.stats.periods.week },
		{ value: 'month', label: locale.stats.periods.month }
	];

	const tabHref = (value: Period) => `?period=${value}`;
</script>

<svelte:head><title>{locale.app.pageTitle(locale.trends.title)}</title></svelte:head>

<main class="mx-auto flex min-h-dvh max-w-sm flex-col gap-4 p-4">
	<PageHeader title={locale.trends.title} />

	{#if data.failed}
		<p class="rounded-lg bg-danger-surface p-4 text-danger-ink">{locale.stats.loadFailed}</p>
	{/if}

	<TabBar
		{tabs}
		current={data.period}
		href={tabHref}
		label={locale.stats.trendPickerLabel}
	/>
	<div class="px-1 text-sm text-ink-muted">
		<p>{trendCaption(data.period, data.prevBucket, data.latestBucket)}</p>
		{#each data.away as entry (entry.bucket)}
			<p>
				{words.awayLine(
					bucketLabel(data.period, entry.bucket),
					format.minutesText(entry.minutes),
					entry.label
				)}
			</p>
		{/each}
	</div>

	{#if data.rows.length === 0}
		<p class="py-6 text-center text-sm text-ink-muted">{words.empty}</p>
	{:else if !data.complete}
		<p class="py-6 text-center text-sm text-ink-muted">{trendPending(data.period)}</p>
	{:else}
		<ul class="flex flex-col gap-2">
			{#each data.rows as row (row.key)}
				<TrendTile {row} />
			{/each}
		</ul>
	{/if}
</main>
