<script lang="ts">
	import * as locale from '$lib/locale';

	let {
		value = $bindable(''),
		open = false,
		name = 'note'
	}: {
		value?: string;
		/** Starts unfolded when there is already a note to read. */
		open?: boolean;
		/** Prefixed in the Logga flera sheet, where several notes share a form. */
		name?: string;
	} = $props();
</script>

<!-- <details>, not a toggle: the note is rarely used, so it starts folded —
     and a disclosure works without JavaScript and needs no state at all. -->
<details {open}>
	<summary class="min-h-11 cursor-pointer py-2.5 text-sm font-medium text-ink-label select-none">
		{locale.log.dialog.note}
	</summary>
	<textarea
		{name}
		rows="2"
		bind:value
		class="w-full rounded-lg border-edge-strong"></textarea>
</details>
