<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as locale from '$lib/locale';
	import PageHeader from '$lib/components/PageHeader.svelte';

	let { title, children }: { title: string; children: Snippet } = $props();
</script>

<svelte:head><title>{locale.app.pageTitle(title)}</title></svelte:head>

<main class="mx-auto flex min-h-dvh max-w-sm flex-col gap-6 p-4">
	<!-- Inställningar is the page's title, level with ☰ as every other page's
	     is, and sticks with it; the sub-page's name sits one step below. -->
	<PageHeader
		title={locale.settings.title}
		divider
	>
		{#snippet subtitle()}
			<h2 class="pt-1 text-2xl font-bold">{title}</h2>
		{/snippet}
	</PageHeader>

	{@render children()}
</main>
