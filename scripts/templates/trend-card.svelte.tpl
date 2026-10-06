<script lang="ts">
	import TrendLine from '$lib/components/charts/TrendLine.svelte';
	import * as locale from '$lib/locale';
	import FoldableCard from '$lib/components/FoldableCard.svelte';
	import * as format from '$lib/format';
	import TileGrid from '$lib/components/TileGrid.svelte';
	import type { Tile } from '$lib/stats/summary';
	import type { FieldPoint } from '$lib/types/domain';

	let {
		points,
		tiles = [],
		color
	}: { points: FieldPoint[]; tiles?: Tile[]; color: string } = $props();

	const chartPoints = $derived(
		points.map((point) => ({
			t: new Date(point.occurred_at).getTime(),
			label: format.dayLabel(point.occurred_at.slice(0, 10)),
			value: point.value
		}))
	);
</script>

<FoldableCard title={locale.stats.{{camelId}}.heading}>
	{#if chartPoints.length === 0}
		<p class="text-sm text-ink-muted">{locale.stats.{{camelId}}.empty}</p>
	{:else}
		<TrendLine
			points={chartPoints}
			{color}
			unit="{{unit}}"
			label={locale.stats.{{camelId}}.heading}
		/>
	{/if}
	{#if tiles.length > 0}
		<TileGrid {tiles} />
	{/if}
</FoldableCard>
