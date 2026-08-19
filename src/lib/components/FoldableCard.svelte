<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		title,
		open = true,
		aside,
		children
	}: {
		title: string;
		open?: boolean;
		/** Rendered in the header, left of the chevron — a headline value. */
		aside?: Snippet;
		children: Snippet;
	} = $props();
</script>

<!-- <details> rather than a toggle: folding survives without JavaScript, and
     the whole header bar is the hit target. -->
<details
	{open}
	class="group overflow-hidden rounded-2xl border border-edge bg-surface-raised"
>
	<summary
		class="flex cursor-pointer list-none items-center justify-between border-edge bg-surface-sunken px-4 py-3 font-semibold transition-colors select-none group-open:border-b hover:bg-surface-hover [&::-webkit-details-marker]:hidden"
	>
		<span>{title}</span>
		<span class="flex items-center gap-2">
			{#if aside}
				{@render aside()}
			{/if}
			<span
				class="text-ink-faint transition-transform group-open:rotate-180"
				aria-hidden="true"
			>
				▾
			</span>
		</span>
	</summary>
	<div class="flex flex-col gap-3 p-4">
		{@render children()}
	</div>
</details>
