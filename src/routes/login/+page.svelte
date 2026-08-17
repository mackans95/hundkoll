<script lang="ts">
	import { enhance } from '$app/forms';
	import * as locale from '$lib/locale';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
</script>

<svelte:head><title>{locale.app.pageTitle(locale.login.title)}</title></svelte:head>

<main class="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6">
	<div>
		<h1 class="text-3xl font-bold">{locale.app.name}</h1>
		<p class="mt-1 text-gray-600">{locale.login.prompt}</p>
	</div>

	{#if form?.message}
		<p class="rounded-lg bg-red-50 p-4 text-red-800">{form.message}</p>
	{/if}

	<form method="POST" use:enhance class="flex flex-col gap-3">
		<label class="flex flex-col gap-1">
			<span class="text-sm font-medium text-gray-700">{locale.login.email}</span>
			<input
				type="email"
				name="email"
				required
				autocomplete="username"
				value={form?.email ?? ''}
				class="rounded-lg border-gray-300"
			/>
		</label>
		<label class="flex flex-col gap-1">
			<span class="text-sm font-medium text-gray-700">{locale.login.password}</span>
			<input
				type="password"
				name="password"
				required
				autocomplete="current-password"
				class="rounded-lg border-gray-300"
			/>
		</label>
		<button type="submit" class="btn btn-primary">{locale.login.submit}</button>
	</form>
</main>
