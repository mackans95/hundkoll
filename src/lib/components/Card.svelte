<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		title,
		padding = 'p-4',
		action,
		children
	}: {
		title?: string;
		padding?: string;
		/** Rendered opposite the title — a link out, typically. */
		action?: Snippet;
		children: Snippet;
	} = $props();
</script>

<section class="flex flex-col gap-2 rounded-2xl border border-edge bg-surface-raised {padding}">
	{#if title || action}
		<div class="flex items-baseline justify-between gap-2">
			{#if title}
				<h2 class="font-semibold">{title}</h2>
			{/if}
			{#if action}
				{@render action()}
			{/if}
		</div>
	{/if}
	{@render children()}
</section>
