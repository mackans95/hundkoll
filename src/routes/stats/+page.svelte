<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { replaceState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
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

	// Every period is already loaded, so a tab only swaps which is drawn. The
	// URL follows for a reload; replaced, not pushed, so Back leaves the page.
	const period = $derived(page.state.period ?? data.period);
	function pick(value: Period) {
		const next = new URL(page.url);
		next.searchParams.set('period', value);
		replaceState(next, { ...page.state, period: value });
	}

	// In Settings → Tabeller's order, each drawn from its type's configuration.
	const shown = $derived(
		data.cards.filter((card) => card.shown && card.type in data.views[period])
	);
</script>

<svelte:head><title>{locale.app.pageTitle(locale.stats.title)}</title></svelte:head>

<main class="mx-auto flex min-h-dvh max-w-sm flex-col gap-6 p-4">
	<PageHeader title={locale.stats.title}>
		{#snippet subtitle()}
			<p class="text-sm text-ink-muted">{locale.stats.subtitle(tracked || 30, away)}</p>
		{/snippet}
	</PageHeader>

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
					view={data.views[period][card.type]}
					{period}
					{tabs}
					tabHref={periodHref}
					onpick={pick}
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
