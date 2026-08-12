<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head><title>Inställningar – Hundkoll</title></svelte:head>

<main class="mx-auto flex min-h-dvh max-w-sm flex-col gap-6 p-4">
	<header class="px-1">
		<h1 class="text-3xl font-bold">Inställningar</h1>
	</header>

	{#if data.saved}
		<p class="rounded-lg bg-green-50 p-4 text-green-800">Sparat!</p>
	{/if}
	{#if form?.message}
		<p class="rounded-lg bg-red-50 p-4 text-red-800">{form.message}</p>
	{/if}

	<section class="flex flex-col gap-2">
		<h2 class="px-1 text-sm font-semibold tracking-wide text-gray-500 uppercase">Intervall</h2>
		<p class="px-1 text-sm text-gray-500">
			Antal dagar mellan varje gång. Lämna tomt för aktiviteter utan fast intervall.
		</p>
		<form method="POST" action="?/save" use:enhance class="flex flex-col gap-2">
			{#each data.types as type (type.id)}
				<label
					class="flex items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3"
				>
					<span class="font-medium">{type.icon} {type.label}</span>
					<span class="flex items-center gap-2">
						<input
							type="number"
							name="interval_{type.id}"
							value={type.interval_days ?? ''}
							min="1"
							inputmode="numeric"
							class="w-20 rounded-lg border-gray-300 text-right"
						/>
						<span class="text-sm text-gray-500">dagar</span>
					</span>
				</label>
			{/each}
			<button
				type="submit"
				class="mt-2 rounded-lg bg-gray-900 px-4 py-3 font-semibold text-white active:bg-gray-700"
			>
				Spara
			</button>
		</form>
	</section>

	<section class="mt-auto flex flex-col gap-2">
		<form method="POST" action="?/logout" use:enhance>
			<button
				type="submit"
				class="w-full rounded-lg border border-gray-300 px-4 py-3 font-semibold text-gray-700"
			>
				Logga ut
			</button>
		</form>
	</section>
</main>
