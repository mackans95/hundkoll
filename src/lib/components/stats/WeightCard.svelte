<script lang="ts">
	import TrendLine from '$lib/components/charts/TrendLine.svelte';
	import FoldableCard from '$lib/components/FoldableCard.svelte';
	import { dayLabel, svNum } from '$lib/format';
	import { WEIGHT_COLOR } from '$lib/stats/palette';
	import type { WeightPoint } from '$lib/types/domain';

	let { weights }: { weights: WeightPoint[] } = $props();

	const points = $derived(
		weights.map((weight) => ({
			t: new Date(weight.occurred_at).getTime(),
			label: dayLabel(weight.occurred_at.slice(0, 10)),
			value: weight.kg
		}))
	);
	const latest = $derived(weights.at(-1) ?? null);
</script>

<FoldableCard title="⚖️ Vikt">
	{#snippet aside()}
		{#if latest}
			<span class="text-lg font-bold">{svNum(latest.kg)} kg</span>
		{/if}
	{/snippet}

	{#if points.length === 0}
		<p class="text-sm text-gray-500">Ingen vägning loggad ännu.</p>
	{:else}
		<TrendLine {points} color={WEIGHT_COLOR} unit="kg" />
	{/if}
</FoldableCard>
