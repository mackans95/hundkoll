<script lang="ts">
	import type { Tab } from '$lib/components/TabBar.svelte';
	import AccidentCard from '$lib/components/stats/AccidentCard.svelte';
	import MealCard from '$lib/components/stats/MealCard.svelte';
	import TrendCard from '$lib/components/stats/TrendCard.svelte';
	import WalkCard from '$lib/components/stats/WalkCard.svelte';
	import WeightCard from '$lib/components/stats/WeightCard.svelte';
	import { daysTracked } from '$lib/stats/summary';
	import { stockholmNowForInput } from '$lib/time';
	import type { Period } from '$lib/types/domain';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const today = stockholmNowForInput().slice(0, 10);
	const tracked = $derived(daysTracked(data.summary));

	const tabs: Tab<Period>[] = [
		{ value: 'day', label: 'Dag' },
		{ value: 'week', label: 'Vecka' },
		{ value: 'month', label: 'Månad' }
	];

	// Each tab bar changes its own parameter and leaves the other alone.
	const periodHref = (value: Period) => `?period=${value}&trend=${data.trend}`;
	const trendHref = (value: Period) => `?period=${data.period}&trend=${value}`;
</script>

<svelte:head><title>Statistik – Hundkoll</title></svelte:head>

<main class="mx-auto flex min-h-dvh max-w-sm flex-col gap-6 p-4">
	<header class="px-1">
		<h1 class="text-3xl font-bold">Statistik</h1>
		<p class="mt-1 text-sm text-gray-500">
			Snitt över de senaste {tracked || 30} dagarna.
		</p>
	</header>

	<TrendCard
		period={data.trend}
		prev={data.trendPrev}
		latest={data.trendLatest}
		prevBucket={data.trendPrevBucket}
		latestBucket={data.trendLatestBucket}
		{tabs}
		tabHref={trendHref}
	/>

	<WalkCard days={data.walkDays} summary={data.summary} {today} />

	<MealCard days={data.mealDays} summary={data.summary} {today} />

	<AccidentCard
		bins={data.accidentBins}
		period={data.period}
		summary={data.summary}
		{tracked}
		{today}
		{tabs}
		tabHref={periodHref}
	/>

	<WeightCard weights={data.weights} />
</main>
