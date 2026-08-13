<script lang="ts">
	import LogDialog from '$lib/LogDialog.svelte';
	import { detailSummary } from '$lib/events';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// Category identity is carried by the tile colors alone.
	const CATEGORY_COLORS: Record<string, string> = {
		routine: 'border-emerald-800 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-700',
		care: 'border-sky-800 bg-sky-600 hover:bg-sky-700 active:bg-sky-700',
		health: 'border-amber-800 bg-amber-600 hover:bg-amber-700 active:bg-amber-700'
	};

	const timeFormat = new Intl.DateTimeFormat('sv-SE', {
		timeZone: 'Europe/Stockholm',
		weekday: 'short',
		day: 'numeric',
		month: 'short',
		hour: '2-digit',
		minute: '2-digit'
	});
</script>

<svelte:head><title>Hundkoll</title></svelte:head>

<main class="mx-auto flex min-h-dvh max-w-sm flex-col gap-4 p-4 pb-10">
	<header class="px-1">
		<h1 class="text-3xl font-bold">{data.dog?.name ?? 'Hundkoll'}</h1>
		<p class="mt-1 text-sm text-gray-500">Daglig logg</p>
	</header>

	{#if form?.message && !data.detailType}
		<p class="rounded-lg bg-red-50 p-4 text-red-800">{form.message}</p>
	{/if}

	<section class="rounded-2xl border border-gray-200 bg-white p-3">
		<div class="grid grid-cols-3 gap-2">
			{#each data.types as type (type.id)}
				<a
					href="?detail={type.id}"
					class="flex w-full flex-col items-center gap-1 rounded-2xl border px-1 py-4 text-white transition active:scale-95 {CATEGORY_COLORS[
						type.category
					]}"
				>
					<span class="text-3xl" aria-hidden="true">{type.icon}</span>
					<span class="text-sm font-semibold">{type.label}</span>
				</a>
			{/each}
		</div>
	</section>

	<section class="flex flex-col gap-2 rounded-2xl border border-gray-200 bg-white p-4">
		<h2 class="font-semibold">Senaste händelser</h2>
		{#if data.events.length === 0}
			<p class="text-gray-500">Inget loggat ännu.</p>
		{:else}
			<ul class="divide-y divide-gray-200">
				{#each data.events as event (event.id)}
					{@const extra = [detailSummary(event.type_id, event.details), event.note]
						.filter(Boolean)
						.join(' · ')}
					<li class="flex items-baseline justify-between gap-3 py-2">
						<span class="min-w-0">
							<span class="font-medium"
								>{event.type?.icon} {event.type?.label ?? event.type_id}</span
							>
							{#if extra}
								<span class="block truncate text-sm text-gray-500">{extra}</span>
							{/if}
						</span>
						<time datetime={event.occurred_at} class="shrink-0 text-sm text-gray-500">
							{timeFormat.format(new Date(event.occurred_at))}
						</time>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</main>

{#if data.detailType}
	{#key data.detailType.id}
		<LogDialog type={data.detailType} nowLocal={data.nowLocal} message={form?.message ?? null} />
	{/key}
{/if}
