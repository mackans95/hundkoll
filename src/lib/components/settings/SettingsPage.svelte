<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as locale from '$lib/locale';

	let { title, children }: { title: string; children: Snippet } = $props();
</script>

<svelte:head><title>{locale.app.pageTitle(title)}</title></svelte:head>

<main class="mx-auto flex min-h-dvh max-w-sm flex-col gap-6 p-4">
	<!-- Inställningar is the page's h1, level with ☰ as every other page's
	     title is; the sub-page's name sits one step below it. -->
	<header class="px-1">
		<h1 class="text-3xl font-bold">{locale.settings.title}</h1>
		<h2 class="mt-1 text-2xl font-bold">{title}</h2>
	</header>

	{@render children()}
</main>
