<script lang="ts">
	import * as locale from '$lib/locale';

	let { value = $bindable('') }: { value?: string } = $props();
</script>

<!-- <details>, not a toggle: the note is rarely used, so it starts folded —
     and a disclosure works without JavaScript and needs no state at all. -->
<details>
	<summary class="min-h-11 cursor-pointer py-2.5 text-sm font-medium text-ink-label select-none">
		{locale.log.dialog.note}
	</summary>
	<textarea
		name="note"
		rows="2"
		bind:value
		class="w-full rounded-lg border-edge-strong"></textarea>
</details>
