<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();

	const linkError = $derived(page.url.searchParams.get('error') === 'auth');
</script>

<svelte:head><title>Logga in – Hundkoll</title></svelte:head>

<main class="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6">
	<div>
		<h1 class="text-3xl font-bold">Hundkoll</h1>
		<p class="mt-1 text-gray-600">Logga in med en magisk länk.</p>
	</div>

	{#if form?.sent}
		<p class="rounded-lg bg-green-50 p-4 text-green-800">
			Kolla din mejl! En inloggningslänk är skickad till <strong>{form.email}</strong>.
		</p>
	{:else}
		{#if linkError}
			<p class="rounded-lg bg-red-50 p-4 text-red-800">
				Länken har gått ut eller redan använts. Begär en ny.
			</p>
		{/if}
		{#if form?.message}
			<p class="rounded-lg bg-red-50 p-4 text-red-800">{form.message}</p>
		{/if}

		<form method="POST" use:enhance class="flex flex-col gap-3">
			<label class="flex flex-col gap-1">
				<span class="text-sm font-medium text-gray-700">Mejladress</span>
				<input
					type="email"
					name="email"
					required
					autocomplete="email"
					value={form?.email ?? ''}
					class="rounded-lg border-gray-300"
				/>
			</label>
			<button
				type="submit"
				class="rounded-lg bg-gray-900 px-4 py-3 font-semibold text-white active:bg-gray-700"
			>
				Skicka länk
			</button>
		</form>
	{/if}
</main>
