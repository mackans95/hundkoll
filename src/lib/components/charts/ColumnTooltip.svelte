<script lang="ts">
	import type { ColumnBucket } from '$lib/types/charts';
	import { placeTooltip } from './geometry';

	let {
		bucket,
		anchorX,
		pointerY,
		viewportW,
		viewportH
	}: {
		bucket: ColumnBucket;
		/** Centre of the hovered column, in viewport pixels. */
		anchorX: number;
		/** The pointer — a thumb, usually — which the box stays clear of. */
		pointerY: number;
		viewportW: number;
		viewportH: number;
	} = $props();

	// Measured, because both clamps need the box's own size.
	let tipW = $state(0);
	let tipH = $state(0);
	const place = $derived(
		placeTooltip({ x: anchorX, y: pointerY }, { w: tipW, h: tipH }, { w: viewportW, h: viewportH })
	);
</script>

<!-- fixed, so no card can clip it; z-25 sits over the tab bar (z-20) and
     under a modal sheet (z-30), which cannot be open over a chart anyway. -->
<div
	bind:clientWidth={tipW}
	bind:clientHeight={tipH}
	class="pointer-events-none fixed z-25 -translate-x-1/2 rounded-lg bg-tooltip px-2.5 py-1.5 text-xs whitespace-nowrap text-tooltip-ink shadow-lg {place.bottomAnchored
		? '-translate-y-full'
		: ''}"
	style="left: {place.centerX}px; top: {place.topPx}px"
>
	<p class="font-semibold">{bucket.tooltip.heading}</p>
	<div class="mt-1 flex flex-col gap-1">
		<!-- Unkeyed on purpose: rows and cells are positional, with no identity
		     of their own, and the whole tooltip is rebuilt whenever the hovered
		     column changes. -->
		{#each bucket.tooltip.rows as row}
			<div class="flex items-stretch rounded-md bg-tooltip-tint px-2 py-1">
				{#each row as cell, ci}
					{#if ci > 0}
						<span class="mx-2 w-px shrink-0 self-stretch bg-tooltip-edge"></span>
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
							<span class={cell.big ? 'text-lg leading-none' : 'text-tooltip-ink-muted'}>
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
