<script lang="ts">
	import type { EventCategory, EventType } from '$lib/types/domain';

	let {
		types,
		onOpen
	}: {
		types: EventType[];
		/** Opens the dialog from data the page already has. */
		onOpen: (type: EventType) => void;
	} = $props();

	// Category identity is carried by the tile colours alone — one grid, no
	// sub-headings, so every activity is one thumb-reach away.
	const CATEGORY_COLORS: Record<EventCategory, string> = {
		routine: 'border-emerald-800 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-700',
		care: 'border-sky-800 bg-sky-600 hover:bg-sky-700 active:bg-sky-700',
		health: 'border-amber-800 bg-amber-600 hover:bg-amber-700 active:bg-amber-700'
	};

	/**
	 * Opens the dialog here rather than letting the link fetch one. The tile
	 * needs nothing the page has not already loaded — the activity, the current
	 * time and a fresh row id — so following the href would buy a round trip to
	 * Stockholm and the same dialog at the end of it.
	 */
	function tap(event: MouseEvent, type: EventType) {
		event.preventDefault();
		onOpen(type);
	}
</script>

<div class="grid grid-cols-3 gap-2">
	{#each types as type (type.id)}
		<!-- The href is what makes a tap work before hydration and with no
		     JavaScript at all: ?detail= renders the same dialog on the server. -->
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
