<script lang="ts">
	import type { ColumnBucket } from '$lib/types/charts';
	import ColumnTooltip from './ColumnTooltip.svelte';
	import { niceCeil, roundedTop, stack, total } from './geometry';

	let {
		buckets,
		colors,
		height = 150,
		label
	}: {
		buckets: ColumnBucket[];
		colors: string[];
		height?: number;
		/** Accessible name for the chart, e.g. the card heading. */
		label?: string;
	} = $props();

	const W = 340;
	const PAD_TOP = 14;
	const PAD_BOTTOM = 16;
	const plotH = $derived(height - PAD_TOP - PAD_BOTTOM);

	const top = $derived(niceCeil(Math.max(1, ...buckets.map((bucket) => total(bucket.segments)))));
	const slot = $derived(W / Math.max(1, buckets.length));
	const barW = $derived(Math.max(2, Math.min(16, slot - 2)));

	/** Places a value on the vertical axis, counting down from the top. */
	function y(value: number): number {
		return PAD_TOP + plotH * (1 - value / top);
	}

	// Hover follows the pointer at the container level: per-bar enter events
	// don't fire during a touch drag (the first-touched element captures the
	// pointer), but container pointermove does.
	let hovered = $state<number | null>(null);
	// Only ever read inside event handlers, so it has no need to be reactive.
	let containerEl: HTMLDivElement | undefined;
	let containerW = $state(0);

	/** Picks the column under the pointer from its position across the chart. */
	function hoverFromEvent(e: PointerEvent) {
		if (!containerEl) return;
		const rect = containerEl.getBoundingClientRect();
		const idx = Math.floor(((e.clientX - rect.left) / rect.width) * buckets.length);
		hovered = Math.min(buckets.length - 1, Math.max(0, idx));
	}

	// Looked up rather than indexed directly where it is used: `hovered` can
	// outlive a `buckets` swap (switching period tabs replaces the data while
	// the chart stays mounted), so the index may briefly point past the new
	// array. A stale index simply means no tooltip.
	const hoveredBucket = $derived(hovered !== null ? (buckets[hovered] ?? null) : null);

	// Where the tooltip points: centred over the hovered column, just above
	// the top of its bar. The tooltip clamps the centre itself.
	const tipCenterPx = $derived(hovered === null ? 0 : (((hovered + 0.5) * slot) / W) * containerW);
	const tipTop = $derived(
		hoveredBucket === null ? 0 : (y(total(hoveredBucket.segments)) * 100) / height
	);
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	bind:this={containerEl}
	bind:clientWidth={containerW}
	class="relative touch-pan-y select-none"
	onpointermove={hoverFromEvent}
	onpointerdown={hoverFromEvent}
	onpointerleave={() => (hovered = null)}
>
	<svg
		viewBox="0 0 {W} {height}"
		class="w-full"
		role="img"
		aria-label={label}
	>
		<line
			x1="0"
			x2={W}
			y1={y(top)}
			y2={y(top)}
			stroke="#f3f4f6"
		/>
		<line
			x1="0"
			x2={W}
			y1={y(top / 2)}
			y2={y(top / 2)}
			stroke="#f3f4f6"
		/>
		<line
			x1="0"
			x2={W}
			y1={y(0)}
			y2={y(0)}
			stroke="#e5e7eb"
		/>
		<text
			x="0"
			y={y(top) - 3}
			font-size="9"
			class="fill-ink-faint">{top}</text
		>

		<!-- Keyed by label, which the builders make unique per column: one
		     calendar day or period each within the chart's window. -->
		{#each buckets as bucket, i (bucket.label)}
			{@const x = i * slot + (slot - barW) / 2}
			<g>
				{#if hovered === i}
					<rect
						x={i * slot}
						y={PAD_TOP}
						width={slot}
						height={plotH}
						fill="#f3f4f6"
						rx="3"
					/>
				{:else}
					<rect
						x={i * slot}
						y={PAD_TOP}
						width={slot}
						height={plotH}
						fill="transparent"
					/>
				{/if}
				<!-- Hovered bar keeps its color and gains a dark outline; the
				     rest of the chart fades back. -->
				<g
					stroke={hovered === i ? '#111827' : 'none'}
					stroke-opacity="0.4"
					opacity={hovered !== null && hovered !== i ? 0.35 : 1}
					style="transition: opacity 120ms"
				>
					{#each stack(bucket.segments, y) as seg (seg.idx)}
						{#if seg.isTop}
							<path
								d={roundedTop(x, seg.y, barW, seg.h)}
								fill={colors[seg.idx]}
							/>
						{:else}
							<rect
								{x}
								y={seg.y}
								width={barW}
								height={seg.h}
								fill={colors[seg.idx]}
							/>
						{/if}
					{/each}
				</g>
				{#if bucket.tick}
					<text
						x={i * slot + slot / 2}
						y={height - 4}
						text-anchor="middle"
						font-size="9"
						class="fill-ink-faint"
					>
						{bucket.label}
					</text>
				{/if}
			</g>
		{/each}
	</svg>

	{#if hoveredBucket !== null}
		<ColumnTooltip
			bucket={hoveredBucket}
			centerPx={tipCenterPx}
			topPercent={tipTop}
			{containerW}
		/>
	{/if}
</div>
