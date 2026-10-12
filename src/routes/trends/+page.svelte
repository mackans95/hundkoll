<script lang="ts">
	import { replaceState } from '$app/navigation';
	import { page } from '$app/state';
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

	// Every period is already loaded, as on Statistik: a tab only swaps which is
	// drawn. The URL follows for a reload; replaced, so Back leaves the page.
	const period = $derived(page.state.period ?? data.period);
	const view = $derived(data.views[period]);
	function pick(value: Period) {
		const next = new URL(page.url);
		next.searchParams.set('period', value);
		replaceState(next, { ...page.state, period: value });
	}
</script>

<svelte:head><title>{locale.app.pageTitle(locale.trends.title)}</title></svelte:head>

<main class="mx-auto flex min-h-dvh max-w-sm flex-col gap-4 p-4">
	<PageHeader title={locale.trends.title} />

	{#if data.failed}
		<p class="rounded-lg bg-danger-surface p-4 text-danger-ink">{locale.stats.loadFailed}</p>
	{/if}

	<TabBar
		{tabs}
		current={period}
		href={tabHref}
		label={locale.stats.trendPickerLabel}
		onpick={pick}
	/>
	<div class="px-1 text-sm text-ink-muted">
		<p>{trendCaption(period, view.prevBucket, view.latestBucket)}</p>
		{#each view.away as entry (entry.bucket)}
			<p>
				{words.awayLine(
					bucketLabel(period, entry.bucket),
					format.minutesText(entry.minutes),
					entry.label
				)}
			</p>
		{/each}
	</div>

	{#if view.rows.length === 0}
		<p class="py-6 text-center text-sm text-ink-muted">{words.empty}</p>
	{:else if !view.complete}
		<p class="py-6 text-center text-sm text-ink-muted">{trendPending(period)}</p>
	{:else}
		<ul class="flex flex-col gap-2">
			{#each view.rows as row (row.key)}
				<TrendTile {row} />
			{/each}
		</ul>
	{/if}
</main>
