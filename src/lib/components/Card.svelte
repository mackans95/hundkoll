<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		title,
		padding = 'p-4',
		children
	}: { title?: string; padding?: string; children: Snippet } = $props();
</script>

<section class="flex flex-col gap-2 rounded-2xl border border-edge bg-surface-raised {padding}">
	{#if title}
		<h2 class="font-semibold">{title}</h2>
	{/if}
	{@render children()}
</section>
