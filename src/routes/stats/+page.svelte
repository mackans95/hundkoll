<script lang="ts">
	import type { Tab } from '$lib/components/TabBar.svelte';
	// codegen:stats-imports — npm run new-event inserts card imports here
	import AccidentCard from '$lib/components/stats/AccidentCard.svelte';
	import MealCard from '$lib/components/stats/MealCard.svelte';
	import TrendCard from '$lib/components/stats/TrendCard.svelte';
	import WalkCard from '$lib/components/stats/WalkCard.svelte';
	import WeightCard from '$lib/components/stats/WeightCard.svelte';
	import * as locale from '$lib/locale';
	import { daysTracked } from '$lib/stats/summary';
	import type { Period } from '$lib/types/domain';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const tracked = $derived(daysTracked(data.summary));

	const tabs: Tab<Period>[] = [
		{ value: 'day', label: locale.stats.periods.day },
		{ value: 'week', label: locale.stats.periods.week },
		{ value: 'month', label: locale.stats.periods.month }
	];

	// Each tab bar changes its own parameter and leaves the other alone.
	// Relative rather than resolve()'d: a tab swaps one parameter and stays
	// where it is, so the path is deliberately whatever page this is.
	const periodHref = (value: Period) => `?period=${value}&trend=${data.trend}`;
	const trendHref = (value: Period) => `?period=${data.period}&trend=${value}`;
</script>

<svelte:head><title>{locale.app.pageTitle(locale.stats.title)}</title></svelte:head>

<main class="mx-auto flex min-h-dvh max-w-sm flex-col gap-6 p-4">
	<header class="px-1">
		<h1 class="text-3xl font-bold">{locale.stats.title}</h1>
		<p class="mt-1 text-sm text-ink-muted">{locale.stats.subtitle(tracked || 30)}</p>
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
		today={data.today}
	/>

	<MealCard
		days={data.mealDays}
		summary={data.summary}
		today={data.today}
	/>

	<AccidentCard
		bins={data.accidentBins}
		period={data.period}
		summary={data.summary}
		{tracked}
		today={data.today}
		{tabs}
		tabHref={periodHref}
	/>

	<WeightCard weights={data.weights} />

	<!-- codegen:stats-cards — npm run new-event inserts generated cards here -->
</main>
