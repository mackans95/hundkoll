<script lang="ts">
	import * as format from '$lib/format';
	import type { ColumnBucket, TrendPoint, TrendTick } from '$lib/types/charts';
	import ColumnTooltip from './ColumnTooltip.svelte';

	let {
		points,
		ticks = [],
		color,
		height = 150,
		label
	}: {
		points: TrendPoint[];
		/** The axis labels, placed across the chart like the points. */
		ticks?: TrendTick[];
		color: string;
		height?: number;
		/** Accessible name for the chart, e.g. the card heading. */
		label?: string;
	} = $props();

	const W = 340;
	const PAD = { top: 14, bottom: 16, left: 30, right: 40 };

	/** A round step that cuts a range into about four: 1, 2 or 5 times a power of ten. */
	function niceStep(range: number): number {
		const raw = range / 4;
		const magnitude = 10 ** Math.floor(Math.log10(raw));
		const norm = raw / magnitude;
		return (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * magnitude;
	}

	// The axis hugs the data, so a weight story in tenths of a kg still reads,
	// but on round numbers, and never below zero for something that can't be.
	const domain = $derived.by(() => {
		if (points.length === 0) return { lo: 0, hi: 1 };
		const values = points.map((p) => p.value);
		const min = Math.min(...values);
		const max = Math.max(...values);
		const pad = (max - min) * 0.1 || Math.abs(max) * 0.1 || 1;
		const step = niceStep(max - min + 2 * pad);
		const lo = Math.floor((min - pad) / step) * step;
		const hi = Math.ceil((max + pad) / step) * step;
		return { lo: min >= 0 ? Math.max(0, lo) : lo, hi: hi > lo ? hi : lo + step };
	});
	const lo = $derived(domain.lo);
	const hi = $derived(domain.hi);

	function x(at: number): number {
		return PAD.left + at * (W - PAD.left - PAD.right);
	}
	function y(v: number): number {
		return PAD.top + (1 - (v - lo) / (hi - lo)) * (height - PAD.top - PAD.bottom);
	}

	const path = $derived(
		points
			.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.at).toFixed(1)},${y(p.value).toFixed(1)}`)
			.join('')
	);
	const last = $derived(points.at(-1));
	// The latest value's label: right of its point, or right-aligned to the
	// edge when the point sits in the right margin, so "50 min" isn't clipped.
	const atEdge = $derived(last ? x(last.at) > W - PAD.right - 8 : false);
	const lastLabel = $derived(last?.text ?? '');

	// Hover follows the pointer at the container level, as the bar chart's
	// does: a touch drag captures the pointer, so per-point events don't fire.
	let hovered = $state<number | null>(null);
	let containerEl: HTMLDivElement | undefined;
	let anchor = $state({ x: 0, y: 0 });
	let viewportW = $state(0);
	let viewportH = $state(0);

	/** Picks the point nearest the pointer across the chart. */
	function hoverFromEvent(e: PointerEvent) {
		if (!containerEl || points.length === 0) return;
		const rect = containerEl.getBoundingClientRect();
		const at = (((e.clientX - rect.left) / rect.width) * W - PAD.left) / (W - PAD.left - PAD.right);
		let nearest = 0;
		for (let i = 1; i < points.length; i++) {
			if (Math.abs(points[i].at - at) < Math.abs(points[nearest].at - at)) nearest = i;
		}
		hovered = nearest;
		anchor = { x: rect.left + (x(points[nearest].at) / W) * rect.width, y: e.clientY };
	}

	// The tooltip reads a column; a point is one with nothing stacked in it.
	// Looked up, since `hovered` can outlive a change of points.
	const hoveredBucket = $derived<ColumnBucket | null>(
		hovered !== null && points[hovered]
			? { label: '', tick: false, segments: [], tooltip: points[hovered].tooltip }
			: null
	);
</script>

<svelte:window
	bind:innerWidth={viewportW}
	bind:innerHeight={viewportH}
/>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	bind:this={containerEl}
	class="relative touch-pan-y select-none"
	onpointermove={hoverFromEvent}
	onpointerdown={hoverFromEvent}
	onpointerleave={() => (hovered = null)}
	onpointercancel={() => (hovered = null)}
>
	<svg
		viewBox="0 0 {W} {height}"
		class="w-full"
		role="img"
		aria-label={label}
	>
		{#each [hi, (hi + lo) / 2] as line (line)}
			<line
				x1={PAD.left}
				x2={W - PAD.right}
				y1={y(line)}
				y2={y(line)}
				style="stroke: var(--chart-grid)"
			/>
		{/each}
		<line
			x1={PAD.left}
			x2={W - PAD.right}
			y1={y(lo)}
			y2={y(lo)}
			style="stroke: var(--chart-baseline)"
		/>
		{#each [hi, lo] as value (value)}
			<text
				x="0"
				y={y(value) + 3}
				font-size="9"
				class="fill-ink-faint">{format.swedishNumber(value)}</text
			>
		{/each}

		{#if points.length > 1}
			<path
				d={path}
				fill="none"
				style="stroke: {color}"
				stroke-width="2"
				stroke-linejoin="round"
			/>
		{/if}

		<!-- Keyed by position: two events logged at the same instant share a time. -->
		{#each points as p, i (i)}
			<circle
				cx={x(p.at)}
				cy={y(p.value)}
				r={hovered === i ? 6 : 4}
				style="fill: {color}; stroke: {hovered === i
					? 'var(--chart-outline)'
					: 'var(--chart-point-ring)'}"
				stroke-width="2"
			/>
		{/each}
		{#each ticks as tick (tick.at)}
			<text
				x={x(tick.at)}
				y={height - 4}
				text-anchor={tick.at === 0 ? 'start' : tick.at === 1 ? 'end' : 'middle'}
				font-size="9"
				class="fill-ink-faint"
			>
				{tick.label}
			</text>
		{/each}

		{#if last}
			<!-- selective direct label: the latest value only -->
			<text
				x={atEdge ? W - 2 : x(last.at) + 8}
				y={y(last.value) + (atEdge ? -8 : 3)}
				text-anchor={atEdge ? 'end' : 'start'}
				font-size="10"
				font-weight="600"
				class="fill-ink-label"
			>
				{lastLabel}
			</text>
		{/if}
	</svg>

	{#if hoveredBucket !== null}
		<ColumnTooltip
			bucket={hoveredBucket}
			anchorX={anchor.x}
			pointerY={anchor.y}
			{viewportW}
			{viewportH}
		/>
	{/if}
</div>
