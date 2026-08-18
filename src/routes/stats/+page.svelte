<script lang="ts">
	import type { Tab } from '$lib/components/TabBar.svelte';
	import AccidentCard from '$lib/components/stats/AccidentCard.svelte';
	import MealCard from '$lib/components/stats/MealCard.svelte';
	import TrendCard from '$lib/components/stats/TrendCard.svelte';
	import WalkCard from '$lib/components/stats/WalkCard.svelte';
	import WeightCard from '$lib/components/stats/WeightCard.svelte';
	import * as locale from '$lib/locale';
	import { daysTracked } from '$lib/stats/summary';
	import * as time from '$lib/time';
	import type { Period } from '$lib/types/domain';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const today = time.stockholmNowForInput().slice(0, 10);
	const tracked = $derived(daysTracked(data.summary));

	const tabs: Tab<Period>[] = [
		{ value: 'day', label: locale.stats.periods.day },
		{ value: 'week', label: locale.stats.periods.week },
		{ value: 'month', label: locale.stats.periods.month }
	];

	// Each tab bar changes its own parameter and leaves the other alone.
	const periodHref = (value: Period) => `?period=${value}&trend=${data.trend}`;
	const trendHref = (value: Period) => `?period=${data.period}&trend=${value}`;
</script>

<svelte:head><title>{locale.app.pageTitle(locale.stats.title)}</title></svelte:head>

<main class="mx-auto flex min-h-dvh max-w-sm flex-col gap-6 p-4">
	<header class="px-1">
		<h1 class="text-3xl font-bold">{locale.stats.title}</h1>
		<p class="mt-1 text-sm text-gray-500">{locale.stats.subtitle(tracked || 30)}</p>
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

	<WalkCard
		days={data.walkDays}
		summary={data.summary}
		{today}
	/>

	<MealCard
		days={data.mealDays}
		summary={data.summary}
		{today}
	/>

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
