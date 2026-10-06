<script lang="ts">
	import { resolve } from '$app/paths';
	import type { Tab } from '$lib/components/TabBar.svelte';
	import StatsCard from '$lib/components/stats/StatsCard.svelte';
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

	// In Settings → Tabeller's order, each drawn from its type's configuration.
	const shown = $derived(data.cards.filter((card) => card.shown && card.type in data.views));
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

	{#if shown.length > 0}
		<!-- One block rather than a stack of cards: they meet on a single line,
		     and only the first and last keep their rounded corners. -->
		<div
			class="flex flex-col [&>details]:rounded-none [&>details+details]:border-t-0 [&>details:first-child]:rounded-t-2xl [&>details:last-child]:rounded-b-2xl"
		>
			{#each shown as card (card.type)}
				<StatsCard
					view={data.views[card.type]}
					period={data.period}
					{tabs}
					tabHref={periodHref}
				/>
			{/each}
		</div>
	{:else}
		<p class="py-6 text-center text-sm text-ink-muted">
			{locale.stats.noCards}
			<a
				href={resolve('/settings/tables')}
				class="underline">{locale.stats.noCardsLink}</a
			>
		</p>
	{/if}
</main>
