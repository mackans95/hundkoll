<script lang="ts">
	import type { Tile } from '$lib/stats/summary';

	let { tile }: { tile: Tile } = $props();
</script>

<!-- Label above value: the label is the question, the number is the answer. -->
<div class="flex flex-col gap-1 rounded-lg border border-gray-300 bg-gray-50 p-2 text-center">
	<p class="text-xs text-gray-500">{tile.label}</p>
	<p class="my-auto text-lg font-bold">{tile.value}</p>
</div>
