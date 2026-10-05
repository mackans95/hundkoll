<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as locale from '$lib/locale';

	let { title, children }: { title: string; children: Snippet } = $props();
</script>

<svelte:head><title>{locale.app.pageTitle(title)}</title></svelte:head>

<main class="mx-auto flex min-h-dvh max-w-sm flex-col gap-6 p-4">
	<header class="px-1">
		<p class="text-sm text-ink-muted">{locale.settings.title}</p>
		<h1 class="text-3xl font-bold">{title}</h1>
	</header>

	{@render children()}
</main>
