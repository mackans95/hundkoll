<script lang="ts">
	import StackedColumns from '$lib/components/charts/StackedColumns.svelte';
	import * as locale from '$lib/locale';
	import FoldableCard from '$lib/components/FoldableCard.svelte';
	import TileGrid from '$lib/components/TileGrid.svelte';
	import { simpleCountBuckets } from '$lib/stats/buckets';
	import type { Tile } from '$lib/stats/summary';
	import type { DetailDayCount, SimpleDay } from '$lib/types/domain';

	// detailDays is optional so a card can gain a tooltip breakdown later
	// without the page having to pass anything until it does. The tiles are
	// chosen on the type's Settings page (plan 29).
	let {
		days,
		today,
		tiles = [],
		detailDays = [],
		color
	}: {
		days: SimpleDay[];
		today: string;
		tiles?: Tile[];
		detailDays?: DetailDayCount[];
		/** The type's main colour, as Settings chose it. */
		color: string;
	} = $props();

	const buckets = $derived(
		simpleCountBuckets(days, today, locale.stats.{{camelId}}.tooltipLabel, color{{breakdown}})
	);
</script>

<FoldableCard title={locale.stats.{{camelId}}.heading}>
	<StackedColumns
		{buckets}
		colors={[color]}
		label={locale.stats.{{camelId}}.heading}
	/>
	{#if tiles.length > 0}
		<TileGrid {tiles} />
	{/if}
</FoldableCard>
