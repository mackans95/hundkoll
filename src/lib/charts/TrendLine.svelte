<script lang="ts" module>
	export type TrendPoint = { t: number; label: string; value: number };
</script>

<script lang="ts">
	import { svNum } from '$lib/format';

	let {
		points,
		color = '#0284c7',
		unit = '',
		height = 150
	}: { points: TrendPoint[]; color?: string; unit?: string; height?: number } = $props();

	const W = 340;
	const PAD = { top: 14, bottom: 16, left: 30, right: 40 };

	// Padded domain: a weight story lives in tenths of a kg, so the axis
	// hugs the data instead of starting at zero (fine for lines, never bars).
	const lo = $derived.by(() => {
		const min = Math.min(...points.map((p) => p.value));
		const max = Math.max(...points.map((p) => p.value));
		return min - Math.max((max - min) * 0.15, 0.3);
	});
	const hi = $derived.by(() => {
		const min = Math.min(...points.map((p) => p.value));
		const max = Math.max(...points.map((p) => p.value));
		return max + Math.max((max - min) * 0.15, 0.3);
	});

	const t0 = $derived(Math.min(...points.map((p) => p.t)));
	const t1 = $derived(Math.max(...points.map((p) => p.t)));

	function x(t: number): number {
		if (t1 === t0) return W / 2;
		return PAD.left + ((t - t0) / (t1 - t0)) * (W - PAD.left - PAD.right);
	}
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

<svg viewBox="0 0 {W} {height}" class="w-full" role="img">
	<line x1={PAD.left} x2={W - PAD.right} y1={y(hi)} y2={y(hi)} stroke="#f3f4f6" />
	<line x1={PAD.left} x2={W - PAD.right} y1={y(lo)} y2={y(lo)} stroke="#e5e7eb" />
	<text x="0" y={y(hi) + 3} font-size="9" class="fill-gray-400">{svNum(hi)}</text>
	<text x="0" y={y(lo) + 3} font-size="9" class="fill-gray-400">{svNum(lo)}</text>

	{#if points.length > 1}
		<path d={path} fill="none" stroke={color} stroke-width="2" stroke-linejoin="round" />
	{/if}

	{#each points as p (p.t)}
		<circle cx={x(p.t)} cy={y(p.value)} r="4" fill={color} stroke="#fff" stroke-width="2">
			<title>{p.label}: {svNum(p.value)} {unit}</title>
		</circle>
	{/each}

	{#if last}
		<!-- selective direct label: the latest value only -->
		<text
			x={Math.min(x(last.t) + 8, W - 2)}
			y={y(last.value) + 3}
			font-size="10"
			font-weight="600"
			class="fill-gray-700"
		>
			{svNum(last.value)}{unit ? ` ${unit}` : ''}
		</text>
		<text x={PAD.left} y={height - 4} font-size="9" class="fill-gray-400">
			{points[0].label}
		</text>
		<text x={W - PAD.right} y={height - 4} text-anchor="end" font-size="9" class="fill-gray-400">
			{last.label}
		</text>
	{/if}
</svg>
