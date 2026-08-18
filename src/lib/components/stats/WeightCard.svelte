<script lang="ts">
	import TrendLine from '$lib/components/charts/TrendLine.svelte';
	import * as locale from '$lib/locale';
	import FoldableCard from '$lib/components/FoldableCard.svelte';
	import * as format from '$lib/format';
	import { WEIGHT_COLOR } from '$lib/stats/palette';
	import type { WeightPoint } from '$lib/types/domain';

	let { weights }: { weights: WeightPoint[] } = $props();

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
			<span class="text-lg font-bold">{format.swedishNumber(latest.kg)} kg</span>
		{/if}
	{/snippet}

	{#if points.length === 0}
		<p class="text-sm text-gray-500">{locale.stats.weight.empty}</p>
	{:else}
		<TrendLine {points} color={WEIGHT_COLOR} unit="kg" label={locale.stats.weight.heading} />
	{/if}
</FoldableCard>
