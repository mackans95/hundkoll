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
     padding, and up through the status-bar inset, so content passes under a
     solid band and never shows beneath the clock. -->
<div
	class="sticky top-0 z-20 -mx-4 -mt-[calc(1rem+var(--inset-top))] bg-surface px-5 pt-[calc(1rem+var(--inset-top))]"
>
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
