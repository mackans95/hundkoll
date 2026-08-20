<script lang="ts">
	import type { EventCategory, EventType } from '$lib/types/domain';

	let {
		types,
		onOpen
	}: {
		types: EventType[];
		/**
		 * Opens the dialog from data the page already has. `origin` is the tile
		 * that was tapped, so the dialog can grow out of it.
		 */
		onOpen: (type: EventType, origin: DOMRect) => void;
	} = $props();

	// Category identity is carried by the tile colours alone — one grid, no
	// sub-headings, so every activity is one thumb-reach away. Slate for
	// 'other' on purpose: a violet would collapse toward sky under red-green
	// color-blindness, where a muted neutral stays apart from all three.
	const CATEGORY_COLORS: Record<EventCategory, string> = {
		routine: 'border-emerald-800 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-700',
		care: 'border-sky-800 bg-sky-600 hover:bg-sky-700 active:bg-sky-700',
		health: 'border-amber-800 bg-amber-600 hover:bg-amber-700 active:bg-amber-700',
		other: 'border-slate-800 bg-slate-600 hover:bg-slate-700 active:bg-slate-700'
	};

	/**
	 * Opens the dialog in place: the tile needs nothing the page has not
	 * already loaded, so following the href would buy a round trip for the
	 * same dialog.
	 */
	function tap(event: MouseEvent & { currentTarget: HTMLElement }, type: EventType) {
		event.preventDefault();
		// Measured now: the last moment the tile is certainly where the thumb
		// found it.
		onOpen(type, event.currentTarget.getBoundingClientRect());
	}
</script>

<!-- Wrapping flex, not grid: basis 30% caps a row at three tiles, and flex-1
     lets whatever lands on the last row stretch to fill it — 7 tiles become
     3+3+1 full-width, 8 become 3+3+2 halves. Tap targets only ever grow. -->
<div class="flex flex-wrap gap-2">
	{#each types as type (type.id)}
		<!-- The href is what makes a tap work before hydration and with no
		     JavaScript at all: ?detail= renders the same dialog on the server. -->
		<a
			href="?detail={type.id}"
			onclick={(event) => tap(event, type)}
			class="flex min-w-[30%] flex-1 basis-[30%] flex-col items-center gap-1 rounded-2xl border px-1 py-4 text-white transition active:scale-95 {CATEGORY_COLORS[
				type.category
			]}"
		>
			<span
				class="text-3xl"
				aria-hidden="true">{type.icon}</span
			>
			<span class="text-sm font-semibold">{type.label}</span>
		</a>
	{/each}
</div>
