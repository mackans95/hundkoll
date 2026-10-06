<script lang="ts">
	import { fly } from 'svelte/transition';
	import { toast } from '$lib/toast.svelte';
</script>

<!-- Always in the DOM, so a screen reader hears each message as it arrives. -->
<div
	class="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+var(--nav-inset))] z-30 flex justify-center px-4"
	role="status"
	aria-live="polite"
>
	{#if toast.message}
		<p
			class="rounded-full bg-btn-primary px-5 py-2.5 text-sm font-semibold text-btn-primary-ink shadow-lg"
			transition:fly={{ y: 12, duration: 150 }}
		>
			{toast.message}
		</p>
	{/if}
</div>
