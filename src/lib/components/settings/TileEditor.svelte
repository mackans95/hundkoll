<script lang="ts">
	import * as locale from '$lib/locale';
	import MoveButtons from './MoveButtons.svelte';

	type Option = { key: string; label: string };

	let { tiles, options }: { tiles: Option[]; options: Option[] } = $props();

	const words = locale.settings.type;

	// Edited here and sent with the page's Spara, as on Settings → Trender.
	let rows = $derived(tiles.map((tile) => ({ ...tile })));
	const available = $derived(
		options.filter((option) => !rows.some((row) => row.key === option.key))
	);
	let adding = $derived(available[0]?.key ?? '');

	function move(from: number, to: number) {
		const next = [...rows];
		[next[from], next[to]] = [next[to], next[from]];
		rows = next;
	}

	// ✕ and Lägg till post the page by themselves without JS; with it, they
	// only change the list on screen.
	function remove(event: MouseEvent, at: number) {
		event.preventDefault();
		rows = rows.filter((_, i) => i !== at);
	}

	function add(event: MouseEvent) {
		event.preventDefault();
		const option = available.find((candidate) => candidate.key === adding);
		if (option) rows = [...rows, option];
	}
</script>

<!-- Says the list was on the page, since one with every tile removed posts none. -->
<input
	type="hidden"
	name="tiles_present"
	value="1"
/>
<div class="flex flex-col gap-2">
	{#each rows as row, i (row.key)}
		<div class="flex items-center gap-2 rounded-2xl border border-edge bg-surface-raised px-4 py-2">
			<input
				type="hidden"
				name="tile"
				value={row.key}
			/>
			<span class="min-w-0 flex-1 font-medium">{row.label}</span>
			<MoveButtons
				index={i}
				count={rows.length}
				label={row.label}
				onmove={move}
				name="tile_op"
			/>
			<button
				type="submit"
				name="tile_op"
				value="remove:{i}"
				class="flex size-9 items-center justify-center rounded-lg border border-edge text-ink-label hover:bg-surface-hover"
				onclick={(event) => remove(event, i)}
				aria-label={`${locale.settings.trends.remove}: ${row.label}`}>✕</button
			>
		</div>
	{:else}
		<p class="px-1 text-sm text-ink-muted">{words.noTiles}</p>
	{/each}

	{#if available.length > 0}
		<div class="flex items-center gap-2">
			<select
				name="tile_add"
				bind:value={adding}
				aria-label={words.addTile}
				class="min-w-0 flex-1 rounded-lg border-edge-strong text-sm"
			>
				{#each available as option (option.key)}
					<option value={option.key}>{option.label}</option>
				{/each}
			</select>
			<button
				type="submit"
				name="tile_op"
				value="add"
				class="btn btn-secondary"
				onclick={add}>{locale.settings.trends.addButton}</button
			>
		</div>
	{/if}
</div>
