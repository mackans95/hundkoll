<script lang="ts">
	import * as format from '$lib/format';
	import type { TrendPoint } from '$lib/types/charts';

	let {
		points,
		color = 'var(--chart-weight)',
		unit = '',
		height = 150,
		label
	}: {
		points: TrendPoint[];
		color?: string;
		unit?: string;
		height?: number;
		/** Accessible name for the chart, e.g. the card heading. */
		label?: string;
	} = $props();

	const W = 340;
	const PAD = { top: 14, bottom: 16, left: 30, right: 40 };

	// Padded domain: a weight story lives in tenths of a kg, so the axis
	// hugs the data instead of starting at zero (fine for lines, never bars).
	// An empty chart gets a placeholder domain rather than Infinities.
	const domain = $derived.by(() => {
		if (points.length === 0) return { lo: 0, hi: 1 };
		const values = points.map((p) => p.value);
		const min = Math.min(...values);
		const max = Math.max(...values);
		const pad = Math.max((max - min) * 0.15, 0.3);
		return { lo: min - pad, hi: max + pad };
	});
	const lo = $derived(domain.lo);
	const hi = $derived(domain.hi);

	const t0 = $derived(Math.min(...points.map((p) => p.t)));
	const t1 = $derived(Math.max(...points.map((p) => p.t)));

	/** Places a timestamp along the horizontal axis, centring a lone point. */
	function x(t: number): number {
		if (t1 === t0) return W / 2;
		return PAD.left + ((t - t0) / (t1 - t0)) * (W - PAD.left - PAD.right);
	}
	/** Places a weight on the vertical axis, within the padded domain above. */
	function y(v: number): number {
		return PAD.top + (1 - (v - lo) / (hi - lo)) * (height - PAD.top - PAD.bottom);
	}

	const path = $derived(
		points
			.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.t).toFixed(1)},${y(p.value).toFixed(1)}`)
			.join('')
	);
	const last = $derived(points[points.length - 1]);
</script>

<svg
	viewBox="0 0 {W} {height}"
	class="w-full"
	role="img"
	aria-label={label}
>
	<line
		x1={PAD.left}
		x2={W - PAD.right}
		y1={y(hi)}
		y2={y(hi)}
		style="stroke: var(--chart-grid)"
	/>
	<line
		x1={PAD.left}
		x2={W - PAD.right}
		y1={y(lo)}
		y2={y(lo)}
		style="stroke: var(--chart-baseline)"
	/>
	<text
		x="0"
		y={y(hi) + 3}
		font-size="9"
		class="fill-ink-faint">{format.swedishNumber(hi)}</text
	>
	<text
		x="0"
		y={y(lo) + 3}
		font-size="9"
		class="fill-ink-faint">{format.swedishNumber(lo)}</text
	>

	{#if points.length > 1}
		<path
			d={path}
			fill="none"
			style="stroke: {color}"
			stroke-width="2"
			stroke-linejoin="round"
		/>
	{/if}

	{#each points as p (p.t)}
		<circle
			cx={x(p.t)}
			cy={y(p.value)}
			r="4"
			style="fill: {color}; stroke: var(--chart-point-ring)"
			stroke-width="2"
		>
			<title>{p.label}: {format.swedishNumber(p.value)} {unit}</title>
		</circle>
	{/each}

	{#if last}
		<!-- selective direct label: the latest value only -->
		<text
			x={Math.min(x(last.t) + 8, W - 2)}
			y={y(last.value) + 3}
			font-size="10"
			font-weight="600"
			class="fill-ink-label"
		>
			{format.swedishNumber(last.value)}{unit ? ` ${unit}` : ''}
		</text>
		<text
			x={PAD.left}
			y={height - 4}
			font-size="9"
			class="fill-ink-faint"
		>
			{points[0].label}
		</text>
		<text
			x={W - PAD.right}
			y={height - 4}
			text-anchor="end"
			font-size="9"
			class="fill-ink-faint"
		>
			{last.label}
		</text>
	{/if}
</svg>
