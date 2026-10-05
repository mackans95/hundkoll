<script lang="ts">
	import type { Tab } from '$lib/components/TabBar.svelte';
	// codegen:stats-imports — npm run new-event inserts card imports here
	import AloneCard from '$lib/components/stats/AloneCard.svelte';
	import CarRideCard from '$lib/components/stats/CarRideCard.svelte';
	import AccidentCard from '$lib/components/stats/AccidentCard.svelte';
	import MealCard from '$lib/components/stats/MealCard.svelte';
	import WalkCard from '$lib/components/stats/WalkCard.svelte';
	import WeightCard from '$lib/components/stats/WeightCard.svelte';
	import * as locale from '$lib/locale';
	import { daysAwayText, daysTracked } from '$lib/stats/summary';
	import type { Period } from '$lib/types/domain';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const tracked = $derived(daysTracked(data.summary));
	const away = $derived(daysAwayText(data.summary));

	const tabs: Tab<Period>[] = [
		{ value: 'day', label: locale.stats.periods.day },
		{ value: 'week', label: locale.stats.periods.week },
		{ value: 'month', label: locale.stats.periods.month }
	];

	// Relative rather than resolve()'d: a tab swaps the parameter and stays
	// where it is, so the path is deliberately whatever page this is.
	const periodHref = (value: Period) => `?period=${value}`;
</script>

<svelte:head><title>{locale.app.pageTitle(locale.stats.title)}</title></svelte:head>

<main class="mx-auto flex min-h-dvh max-w-sm flex-col gap-6 p-4">
	<header class="px-1">
		<h1 class="text-3xl font-bold">{locale.stats.title}</h1>
		<p class="mt-1 text-sm text-ink-muted">{locale.stats.subtitle(tracked || 30, away)}</p>
	</header>

	{#if data.failed}
		<p class="rounded-lg bg-danger-surface p-4 text-danger-ink">{locale.stats.loadFailed}</p>
	{/if}

	<WalkCard
		days={data.walkDays}
		summary={data.summary}
		today={data.today}
		color={data.chartColors.walk}
	/>

	<MealCard
		days={data.mealDays}
		summary={data.summary}
		today={data.today}
		color={data.chartColors.meal}
	/>

	<AccidentCard
		bins={data.accidentBins}
		period={data.period}
		summary={data.summary}
		{tracked}
		today={data.today}
		{tabs}
		tabHref={periodHref}
		color={data.chartColors.accident}
	/>

	<WeightCard
		weights={data.weights}
		color={data.chartColors.weight}
	/>

	<!-- codegen:stats-cards — npm run new-event inserts generated cards here -->
	<AloneCard
		outcomes={data.aloneOutcomes}
		today={data.today}
		metrics={data.aloneMetrics}
		longestCalm={data.aloneLongestCalm}
		color={data.chartColors.alone}
	/>
	<CarRideCard
		days={data.carRideDays}
		today={data.today}
		metrics={data.carRideMetrics}
		detailDays={data.carRideDetailDays}
		color={data.chartColors.car_ride.main}
	/>
</main>
