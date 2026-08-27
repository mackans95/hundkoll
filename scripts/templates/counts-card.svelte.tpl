<script lang="ts">
	import StackedColumns from '$lib/components/charts/StackedColumns.svelte';
	import * as locale from '$lib/locale';
	import FoldableCard from '$lib/components/FoldableCard.svelte';
{{metricImports}}	import { simpleCountBuckets } from '$lib/stats/buckets';
	import { {{COLOR_CONST}} } from '$lib/stats/palette';
	import type { DetailMetric, SimpleDay } from '$lib/types/domain';

	// metrics is optional so a card can gain tiles later without the page
	// having to pass anything until it does — see the metric kinds in
	// scripts/new-event-core.ts.
	let {
		days,
		today,
		metrics = []
	}: { days: SimpleDay[]; today: string; metrics?: DetailMetric[] } = $props();

	const buckets = $derived(
		simpleCountBuckets(days, today, locale.stats.{{camelId}}.tooltipLabel, {{COLOR_CONST}})
	);
{{metricTiles}}</script>

<FoldableCard title={locale.stats.{{camelId}}.heading}>
	<StackedColumns
		{buckets}
		colors={[{{COLOR_CONST}}]}
		label={locale.stats.{{camelId}}.heading}
	/>
{{metricBlock}}</FoldableCard>
