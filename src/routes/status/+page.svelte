<script lang="ts">
	import StatusCard from '$lib/components/status/StatusCard.svelte';
	import * as format from '$lib/format';
	import * as locale from '$lib/locale';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>{locale.app.pageTitle(locale.status.title)}</title></svelte:head>

<main class="mx-auto flex min-h-dvh max-w-sm flex-col gap-6 p-4">
	<header class="px-1">
		<h1 class="text-3xl font-bold">{locale.status.title}</h1>
	</header>

	{#if data.statusFailed}
		<p class="rounded-lg bg-danger-surface p-4 text-danger-ink">{locale.status.loadFailed}</p>
	{/if}

	<section class="flex flex-col gap-2">
		<!-- Only when the read landed: "no intervals set" is advice, and advice
		     about a screen we could not read is misleading. -->
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
