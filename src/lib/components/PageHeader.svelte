<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		title,
		aside,
		subtitle,
		divider = false,
		gap = 6
	}: {
		title: string;
		/** Beside the title, kept clear of ☰: Historik's way back to the log. */
		aside?: Snippet;
		/** Under the title; it scrolls away while the title stays. */
		subtitle?: Snippet;
		/** A line under the title, as the settings pages have. */
		divider?: boolean;
		/** The page's own gap between blocks, which the subtitle tucks up into. */
		gap?: 4 | 6;
	} = $props();
</script>

<!-- The title row sticks to the top as the page scrolls, ☰ with it (the
     layout's), so the menu is always one tap away. It spans the page's
     padding so content passes under a solid band, not around a floating
     word. -->
<div class="sticky top-0 z-20 -mx-4 -mt-4 bg-surface px-5 pt-4">
	<div
		class="flex items-baseline justify-between gap-2 pr-14 pb-2 {divider
			? 'border-b border-edge'
			: ''}"
	>
		<h1 class="text-3xl font-bold">{title}</h1>
		{@render aside?.()}
	</div>
</div>
{#if subtitle}
	<div class="px-1 {gap === 6 ? '-mt-5' : '-mt-3'}">
		{@render subtitle()}
	</div>
{/if}
