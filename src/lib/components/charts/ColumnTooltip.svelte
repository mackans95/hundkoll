<script lang="ts">
	import type { ColumnBucket } from '$lib/types/charts';

	let {
		bucket,
		centerPx,
		topPercent,
		containerW
	}: {
		bucket: ColumnBucket;
		/** Where the tooltip wants its centre: over the hovered column. */
		centerPx: number;
		/** How far down the box points, as a percentage of the chart height. */
		topPercent: number;
		containerW: number;
	} = $props();

	// Clamped by the measured tooltip width so the box never leaves the
	// container (and therefore never the viewport).
	let tipW = $state(0);
	const leftPx = $derived.by(() => {
		if (containerW === 0) return 0;
		const half = tipW / 2;
		return Math.min(containerW - half - 2, Math.max(half + 2, centerPx));
	});
</script>

<div
	bind:clientWidth={tipW}
	class="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg bg-gray-900 px-2.5 py-1.5 text-xs whitespace-nowrap text-white shadow-lg"
	style="left: {leftPx}px; top: calc({topPercent}% - 6px)"
>
	<p class="font-semibold">{bucket.tooltip.heading}</p>
	<div class="mt-1 flex flex-col gap-1">
		<!-- Unkeyed on purpose: rows and cells are positional, with no identity
		     of their own, and the whole tooltip is rebuilt whenever the hovered
		     column changes. -->
		{#each bucket.tooltip.rows as row}
			<div class="flex items-stretch rounded-md bg-white/10 px-2 py-1">
				{#each row as cell, ci}
					{#if ci > 0}
						<span class="mx-2 w-px shrink-0 self-stretch bg-white/20"></span>
					{/if}
					<span
						class="flex flex-1 items-center gap-1.5 {row.length > 1
							? 'justify-center'
							: 'justify-between'}"
					>
						{#if cell.color}
							<span
								class="h-2 w-2 shrink-0 rounded-full"
								style="background:{cell.color}"
							></span>
						{/if}
						{#if cell.label}
							<span class={cell.big ? 'text-lg leading-none' : 'text-gray-300'}>
								{cell.label}
							</span>
						{/if}
						<span class="font-semibold">{cell.value}</span>
					</span>
				{/each}
			</div>
		{/each}
	</div>
</div>
