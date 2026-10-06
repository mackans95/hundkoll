<script lang="ts">
	import TrendLine from '$lib/components/charts/TrendLine.svelte';
	import * as locale from '$lib/locale';
	import FoldableCard from '$lib/components/FoldableCard.svelte';
	import * as format from '$lib/format';
	import type { ChartColor } from '$lib/stats/palette';
	import type { WeightPoint } from '$lib/types/domain';

	let { weights, color }: { weights: WeightPoint[]; color: ChartColor } = $props();

	const points = $derived(
		weights.map((weight) => ({
			t: new Date(weight.occurred_at).getTime(),
			label: format.dayLabel(weight.occurred_at.slice(0, 10)),
			value: weight.kg
		}))
	);
	const latest = $derived(weights.at(-1) ?? null);
</script>

<FoldableCard title={locale.stats.weight.heading}>
	{#snippet aside()}
		{#if latest}
			<!-- The header's own size, so Vikt's header is as tall as every other card's. -->
			<span class="font-bold">{format.swedishNumber(latest.kg)} kg</span>
		{/if}
	{/snippet}

	{#if points.length === 0}
		<p class="text-sm text-ink-muted">{locale.stats.weight.empty}</p>
	{:else}
		<TrendLine
			{points}
			color={color.main}
			unit="kg"
			label={locale.stats.weight.heading}
		/>
	{/if}
</FoldableCard>
