<script lang="ts">
	import StatTile from '$lib/components/StatTile.svelte';
	import type { Tile } from '$lib/stats/summary';

	let { tiles }: { tiles: Tile[] } = $props();
</script>

<!-- Every card's tiles in one shape: two columns, and with an odd count the
     first spans both, as the card's headline number. -->
<div class="grid grid-cols-2 gap-2">
	{#each tiles as tile, i (tile.label)}
		<div class={i === 0 && tiles.length % 2 === 1 ? 'col-span-2 grid' : 'grid'}>
			<StatTile {tile} />
		</div>
	{/each}
</div>
