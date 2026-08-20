<script lang="ts">
	import TrendLine from '$lib/components/charts/TrendLine.svelte';
	import * as locale from '$lib/locale';
	import FoldableCard from '$lib/components/FoldableCard.svelte';
	import * as format from '$lib/format';
	import { {{COLOR_CONST}} } from '$lib/stats/palette';
	import type { FieldPoint } from '$lib/types/domain';

	let { points }: { points: FieldPoint[] } = $props();

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
			color={{{COLOR_CONST}}}
			unit="{{unit}}"
			label={locale.stats.{{camelId}}.heading}
		/>
	{/if}
</FoldableCard>
