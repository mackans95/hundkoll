<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

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

<main class="mx-auto flex min-h-dvh max-w-sm flex-col gap-6 p-6">
	<header class="flex items-center justify-between">
		<h1 class="text-3xl font-bold">{data.dog?.name ?? 'Hundkoll'}</h1>
		<form method="POST" action="?/logout" use:enhance>
			<button type="submit" class="text-sm text-gray-500 underline">Logga ut</button>
		</form>
	</header>

	{#if form?.message}
		<p class="rounded-lg bg-red-50 p-4 text-red-800">{form.message}</p>
	{/if}

	<form method="POST" action="?/logWalk" use:enhance>
		<button
			type="submit"
			class="w-full rounded-2xl bg-emerald-600 px-4 py-6 text-2xl font-bold text-white active:bg-emerald-700"
		>
			Promenad nu
		</button>
	</form>

	<section class="flex flex-col gap-2">
		<h2 class="text-sm font-semibold tracking-wide text-gray-500 uppercase">Senaste händelser</h2>
		{#if data.events.length === 0}
			<p class="text-gray-500">Inget loggat ännu.</p>
		{:else}
			<ul class="divide-y divide-gray-200">
				{#each data.events as event (event.id)}
					<li class="flex items-baseline justify-between py-2">
						<span class="font-medium">{event.type?.label}</span>
						<time datetime={event.occurred_at} class="text-sm text-gray-500">
							{timeFormat.format(new Date(event.occurred_at))}
						</time>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</main>
