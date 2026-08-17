<script lang="ts">
	import type { EventCategory, EventType } from '$lib/types/domain';

	let {
		types,
		onOfflineTap
	}: {
		types: EventType[];
		/** Called instead of navigating when there is no connection. */
		onOfflineTap: (type: EventType) => void;
	} = $props();

	// Category identity is carried by the tile colours alone — one grid, no
	// sub-headings, so every activity is one thumb-reach away.
	const CATEGORY_COLORS: Record<EventCategory, string> = {
		routine: 'border-emerald-800 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-700',
		care: 'border-sky-800 bg-sky-600 hover:bg-sky-700 active:bg-sky-700',
		health: 'border-amber-800 bg-amber-600 hover:bg-amber-700 active:bg-amber-700'
	};

	/**
	 * Lets the link navigate when there is signal, and asks the page to open a
	 * dialog itself when there is not.
	 */
	function tap(event: MouseEvent, type: EventType) {
		if (navigator.onLine) {
			return;
		}
		event.preventDefault();
		onOfflineTap(type);
	}
</script>

<div class="grid grid-cols-3 gap-2">
	{#each types as type (type.id)}
		<a
			href="?detail={type.id}"
			onclick={(event) => tap(event, type)}
			class="flex w-full flex-col items-center gap-1 rounded-2xl border px-1 py-4 text-white transition active:scale-95 {CATEGORY_COLORS[
				type.category
			]}"
		>
			<span class="text-3xl" aria-hidden="true">{type.icon}</span>
			<span class="text-sm font-semibold">{type.label}</span>
		</a>
	{/each}
</div>
