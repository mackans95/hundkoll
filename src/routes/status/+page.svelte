<script lang="ts">
	import StatusCard from '$lib/components/status/StatusCard.svelte';
	import * as format from '$lib/format';
	import * as locale from '$lib/locale';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// The absence type's own label, so the banner and badges follow a rename.
	const awayLabel = $derived(data.away ? (data.away.type?.label ?? data.away.type_id) : null);
</script>

<svelte:head><title>{locale.app.pageTitle(locale.status.title)}</title></svelte:head>

<main class="mx-auto flex min-h-dvh max-w-sm flex-col gap-6 p-4">
	<header class="px-1">
		<h1 class="text-3xl font-bold">{locale.status.title}</h1>
	</header>

	{#if data.statusFailed}
		<p class="rounded-lg bg-danger-surface p-4 text-danger-ink">{locale.status.loadFailed}</p>
	{/if}

	{#if data.away && awayLabel}
		<p class="rounded-lg bg-surface-hover p-4 text-ink-soft">
			<span aria-hidden="true">{data.away.type?.icon}</span>
			{locale.status.awayBanner(awayLabel, format.eventTime(new Date(data.away.occurred_at)))}
		</p>
	{/if}

	<section class="flex flex-col gap-2">
		<h2 class="px-1 text-sm font-semibold tracking-wide text-ink-muted uppercase">
			{locale.status.dailyHeading}
		</h2>
		<!-- Only these pause: a nail trim due in twelve days does not care who
		     is holding the lead. -->
		{#each data.daily as row (row.type_id)}
			<StatusCard
				{row}
				now={data.now}
				pausedBy={awayLabel}
			/>
		{/each}
	</section>

	<section class="flex flex-col gap-2">
		<!-- Only when the read landed: "no intervals set" is advice, and advice
		     about a screen we could not read is misleading. -->
		<h2 class="px-1 text-sm font-semibold tracking-wide text-ink-muted uppercase">
			{locale.status.intervalHeading}
		</h2>
		{#if data.timed.length === 0 && !data.statusFailed}
			<p class="px-1 text-ink-muted">{locale.status.noIntervals}</p>
		{/if}
		{#each data.timed as row (row.type_id)}
			<StatusCard
				{row}
				now={data.now}
			/>
		{/each}
	</section>

	<section class="flex flex-col gap-2">
		<h2 class="px-1 text-sm font-semibold tracking-wide text-ink-muted uppercase">
			{locale.status.lastLoggedHeading}
		</h2>
		<ul class="divide-y divide-edge px-1">
			{#each data.untimed as row (row.type_id)}
				<li class="flex items-baseline justify-between gap-3 py-2">
					<span class="font-medium">{row.icon} {row.label}</span>
					<span class="shrink-0 text-sm text-ink-muted">
						{row.last_at
							? format.swedishRelative(new Date(row.last_at), data.now)
							: locale.status.never}
					</span>
				</li>
			{/each}
		</ul>
	</section>
</main>
