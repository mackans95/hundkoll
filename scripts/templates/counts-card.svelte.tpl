<script lang="ts">
	import StackedColumns from '$lib/components/charts/StackedColumns.svelte';
	import * as locale from '$lib/locale';
	import FoldableCard from '$lib/components/FoldableCard.svelte';
	import { simpleCountBuckets } from '$lib/stats/buckets';
	import { {{COLOR_CONST}} } from '$lib/stats/palette';
	import type { SimpleDay } from '$lib/types/domain';

	let { days, today }: { days: SimpleDay[]; today: string } = $props();

	const buckets = $derived(
		simpleCountBuckets(days, today, locale.stats.{{camelId}}.tooltipLabel, {{COLOR_CONST}})
	);
</script>

<FoldableCard title={locale.stats.{{camelId}}.heading}>
	<StackedColumns
		{buckets}
		colors={[{{COLOR_CONST}}]}
		label={locale.stats.{{camelId}}.heading}
	/>
</FoldableCard>
