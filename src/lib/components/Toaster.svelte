<script lang="ts">
	import { fly } from 'svelte/transition';
	import { toast } from '$lib/toast.svelte';
</script>

<!-- At the top, where it can't sit on the save button it answers, and in
     the success colours with a mark, so it reads as more than a white bar.
     Always in the DOM, so a screen reader hears each message as it arrives. -->
<div
	class="pointer-events-none fixed inset-x-0 top-[calc(0.75rem+var(--inset-top))] z-30 flex justify-center px-4"
	role="status"
	aria-live="polite"
>
	{#if toast.message}
		<p
			class="flex items-center gap-2 rounded-full border border-success-ink/30 bg-success-badge px-5 py-2.5 text-sm font-semibold text-success-ink shadow-lg"
			transition:fly={{ y: -12, duration: 150 }}
		>
			<span aria-hidden="true">✓</span>
			{toast.message}
		</p>
	{/if}
</div>
