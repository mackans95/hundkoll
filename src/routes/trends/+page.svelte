<script lang="ts">
	import type { Tab } from '$lib/components/TabBar.svelte';
	import TrendCard from '$lib/components/stats/TrendCard.svelte';
	import * as locale from '$lib/locale';
	import type { Period } from '$lib/types/domain';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const tabs: Tab<Period>[] = [
		{ value: 'day', label: locale.stats.periods.day },
		{ value: 'week', label: locale.stats.periods.week },
		{ value: 'month', label: locale.stats.periods.month }
	];

	const tabHref = (value: Period) => `?period=${value}`;
</script>

<svelte:head><title>{locale.app.pageTitle(locale.trends.title)}</title></svelte:head>

<main class="mx-auto flex min-h-dvh max-w-sm flex-col gap-6 p-4">
	<header class="px-1">
		<h1 class="text-3xl font-bold">{locale.trends.title}</h1>
	</header>

	{#if data.failed}
		<p class="rounded-lg bg-danger-surface p-4 text-danger-ink">{locale.stats.loadFailed}</p>
	{/if}

	<TrendCard
		period={data.period}
		prev={data.prev}
		latest={data.latest}
		prevBucket={data.prevBucket}
		latestBucket={data.latestBucket}
		{tabs}
		{tabHref}
	/>
</main>
