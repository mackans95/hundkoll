<script lang="ts" module>
	export type TooltipRow = { label: string; value: string; color?: string };

	export type ColumnBucket = {
		label: string;
		tick: boolean;
		segments: number[];
		tooltip: { heading: string; rows: TooltipRow[] };
	};
</script>

<script lang="ts">
	let {
		buckets,
		colors,
		height = 150
	}: { buckets: ColumnBucket[]; colors: string[]; height?: number } = $props();

	const W = 340;
	const PAD_TOP = 14;
	const PAD_BOTTOM = 16;
	const plotH = $derived(height - PAD_TOP - PAD_BOTTOM);

	let hovered = $state<number | null>(null);

	function niceCeil(v: number): number {
		if (v <= 5) return Math.ceil(v);
		const pow = 10 ** Math.floor(Math.log10(v));
		for (const m of [1, 2, 2.5, 5, 10]) {
			if (v <= m * pow) return m * pow;
		}
		return 10 * pow;
	}

	function total(bucket: ColumnBucket): number {
		return bucket.segments.reduce((a, v) => a + v, 0);
	}

	const top = $derived(niceCeil(Math.max(1, ...buckets.map(total))));
	const slot = $derived(W / Math.max(1, buckets.length));
	const barW = $derived(Math.max(2, Math.min(16, slot - 2)));

	function y(value: number): number {
		return PAD_TOP + plotH * (1 - value / top);
	}

	/** Stacked segment geometry, bottom-up, with a 2px gap between fills. */
	function stack(segments: number[]): { idx: number; y: number; h: number; isTop: boolean }[] {
		const nonZero = segments.map((v, idx) => ({ v, idx })).filter((s) => s.v > 0);
		const out: { idx: number; y: number; h: number; isTop: boolean }[] = [];
		let cum = 0;
		nonZero.forEach(({ v, idx }, k) => {
			const y0 = y(cum);
			const y1 = y(cum + v);
			const isTop = k === nonZero.length - 1;
			let segY = y1;
			let segH = y0 - y1;
			if (!isTop && segH > 3) {
				segY += 2;
				segH -= 2;
			}
			out.push({ idx, y: segY, h: segH, isTop });
			cum += v;
		});
		return out;
	}

	/** Bar with 3px-rounded top corners, flat baseline (the data end is the top). */
	function roundedTop(x: number, yy: number, w: number, h: number): string {
		const r = Math.min(3, h / 2, w / 2);
		return [
			`M${x},${yy + h}`,
			`V${yy + r}`,
			`Q${x},${yy} ${x + r},${yy}`,
			`H${x + w - r}`,
			`Q${x + w},${yy} ${x + w},${yy + r}`,
			`V${yy + h}`,
			'Z'
		].join('');
	}

	// Tooltip anchor as percentages of the chart box, clamped so the box
	// never hangs outside the card at the edges.
	const tipLeft = $derived(
		hovered === null ? 0 : Math.min(86, Math.max(14, ((hovered + 0.5) * slot * 100) / W))
	);
	const tipTop = $derived(hovered === null ? 0 : (y(total(buckets[hovered])) * 100) / height);
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="relative" onpointerleave={() => (hovered = null)}>
	<svg viewBox="0 0 {W} {height}" class="w-full" role="img">
		<line x1="0" x2={W} y1={y(top)} y2={y(top)} stroke="#f3f4f6" />
		<line x1="0" x2={W} y1={y(top / 2)} y2={y(top / 2)} stroke="#f3f4f6" />
		<line x1="0" x2={W} y1={y(0)} y2={y(0)} stroke="#e5e7eb" />
		<text x="0" y={y(top) - 3} font-size="9" class="fill-gray-400">{top}</text>

		{#each buckets as bucket, i (i)}
			{@const x = i * slot + (slot - barW) / 2}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<g onpointerenter={() => (hovered = i)}>
				{#if hovered === i}
					<rect x={i * slot} y={PAD_TOP} width={slot} height={plotH} fill="#f3f4f6" rx="3" />
				{:else}
					<rect x={i * slot} y={PAD_TOP} width={slot} height={plotH} fill="transparent" />
				{/if}
				{#each stack(bucket.segments) as seg (seg.idx)}
					{#if seg.isTop}
						<path d={roundedTop(x, seg.y, barW, seg.h)} fill={colors[seg.idx]} />
					{:else}
						<rect {x} y={seg.y} width={barW} height={seg.h} fill={colors[seg.idx]} />
					{/if}
				{/each}
				{#if bucket.tick}
					<text
						x={i * slot + slot / 2}
						y={height - 4}
						text-anchor="middle"
						font-size="9"
						class="fill-gray-400"
					>
						{bucket.label}
					</text>
				{/if}
			</g>
		{/each}
	</svg>

	{#if hovered !== null}
		{@const bucket = buckets[hovered]}
		<div
			class="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg bg-gray-900 px-2.5 py-1.5 text-xs whitespace-nowrap text-white shadow-lg"
			style="left: {tipLeft}%; top: calc({tipTop}% - 6px)"
		>
			<p class="font-semibold">{bucket.tooltip.heading}</p>
			{#each bucket.tooltip.rows as row (row.label)}
				<p class="flex items-center gap-1.5">
					{#if row.color}
						<span class="h-2 w-2 shrink-0 rounded-full" style="background:{row.color}"></span>
					{/if}
					<span class="text-gray-300">{row.label}</span>
					<span class="ml-auto pl-2 font-semibold">{row.value}</span>
				</p>
			{/each}
		</div>
	{/if}
</div>
