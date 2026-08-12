<script lang="ts">
	import { svDuration, svRelative } from '$lib/time';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const AMBER_WINDOW_MS = 7 * 86_400_000;
	const now = new Date();

	type Badge = { text: string; classes: string };

	function badge(row: (typeof data.timed)[number]): Badge {
		if (!row.due_at) {
			return { text: 'Aldrig loggat', classes: 'bg-gray-100 text-gray-600' };
		}
		const due = new Date(row.due_at);
		const remaining = due.getTime() - now.getTime();
		if (remaining < 0) {
			return { text: `${svDuration(remaining)} försenat`, classes: 'bg-red-100 text-red-800' };
		}
		if (remaining <= AMBER_WINDOW_MS) {
			return { text: `dags ${svRelative(due, now)}`, classes: 'bg-amber-100 text-amber-800' };
		}
		return { text: `dags ${svRelative(due, now)}`, classes: 'bg-green-100 text-green-800' };
	}
</script>

<svelte:head><title>Status – Hundkoll</title></svelte:head>

<main class="mx-auto flex min-h-dvh max-w-sm flex-col gap-6 p-4">
	<header class="px-1">
		<h1 class="text-3xl font-bold">Status</h1>
	</header>

	<section class="flex flex-col gap-2">
		{#if data.timed.length === 0}
			<p class="px-1 text-gray-500">
				Inga aktiviteter har något intervall. Sätt intervall under Inställningar.
			</p>
		{/if}
		{#each data.timed as row (row.type_id)}
			{@const b = badge(row)}
			<article class="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-4">
				<span class="text-3xl" aria-hidden="true">{row.icon}</span>
				<div class="min-w-0 flex-1">
					<h2 class="font-semibold">{row.label}</h2>
					<p class="text-sm text-gray-500">
						{#if row.last_at}
							{svRelative(new Date(row.last_at), now)} · var {row.interval_days}:e dag
						{:else}
							var {row.interval_days}:e dag
						{/if}
					</p>
				</div>
				<span class="shrink-0 rounded-full px-3 py-1 text-sm font-semibold {b.classes}">
					{b.text}
				</span>
			</article>
		{/each}
	</section>

	<section class="flex flex-col gap-2">
		<h2 class="px-1 text-sm font-semibold tracking-wide text-gray-500 uppercase">Senast loggat</h2>
		<ul class="divide-y divide-gray-200 px-1">
			{#each data.untimed as row (row.type_id)}
				<li class="flex items-baseline justify-between gap-3 py-2">
					<span class="font-medium">{row.icon} {row.label}</span>
					<span class="shrink-0 text-sm text-gray-500">
						{row.last_at ? svRelative(new Date(row.last_at), now) : 'aldrig'}
					</span>
				</li>
			{/each}
		</ul>
	</section>
</main>
