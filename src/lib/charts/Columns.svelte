<script lang="ts" module>
	export type ColumnBucket = {
		label: string;
		tick: boolean;
		title: string;
		segments: number[];
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

	function niceCeil(v: number): number {
		if (v <= 5) return Math.ceil(v);
		const pow = 10 ** Math.floor(Math.log10(v));
		for (const m of [1, 2, 2.5, 5, 10]) {
			if (v <= m * pow) return m * pow;
		}
		return 10 * pow;
	}

	const top = $derived(
		niceCeil(Math.max(1, ...buckets.map((b) => b.segments.reduce((a, v) => a + v, 0))))
	);
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
</script>

<svg viewBox="0 0 {W} {height}" class="w-full" role="img">
	<line x1="0" x2={W} y1={y(top)} y2={y(top)} stroke="#f3f4f6" />
	<line x1="0" x2={W} y1={y(top / 2)} y2={y(top / 2)} stroke="#f3f4f6" />
	<line x1="0" x2={W} y1={y(0)} y2={y(0)} stroke="#e5e7eb" />
	<text x="0" y={y(top) - 3} font-size="9" class="fill-gray-400">{top}</text>

	{#each buckets as bucket, i (i)}
		{@const x = i * slot + (slot - barW) / 2}
		<g>
			<title>{bucket.title}</title>
			<rect x={i * slot} y={PAD_TOP} width={slot} height={plotH} fill="transparent" />
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
