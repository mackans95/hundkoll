<script lang="ts">
	import * as locale from '$lib/locale';

	let {
		index,
		count,
		label,
		onmove
	}: {
		index: number;
		count: number;
		/** The row's name, for the buttons' screen-reader names. */
		label: string;
		/** Swaps the row with its neighbour on screen; Spara sends the order. */
		onmove: (from: number, to: number) => void;
	} = $props();

	const words = locale.settings.trends;
	const BUTTON =
		'flex size-9 items-center justify-center rounded-lg border border-edge text-ink-label hover:bg-surface-hover disabled:opacity-30';

	// Each button also posts its move by itself, so a list works without JS;
	// with it, the button only moves the row on screen.
	function move(event: MouseEvent, to: number) {
		event.preventDefault();
		onmove(index, to);
	}
</script>

<button
	type="submit"
	name="op"
	value="up:{index}"
	class={BUTTON}
	disabled={index === 0}
	onclick={(event) => move(event, index - 1)}
	aria-label={`${words.up}: ${label}`}>▲</button
>
<button
	type="submit"
	name="op"
	value="down:{index}"
	class={BUTTON}
	disabled={index === count - 1}
	onclick={(event) => move(event, index + 1)}
	aria-label={`${words.down}: ${label}`}>▼</button
>
