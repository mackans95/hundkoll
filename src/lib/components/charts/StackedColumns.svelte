<script lang="ts">
	import type { ColumnBucket } from './types';

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

	/**
	 * Rounds an axis maximum up to a number a reader can divide by eye, so the
	 * gridline halfway up means something.
	 * 7 → 10, 23 → 25
	 */
	function niceCeil(v: number): number {
		if (v <= 5) return Math.ceil(v);
		const pow = 10 ** Math.floor(Math.log10(v));
		for (const m of [1, 2, 2.5, 5, 10]) {
			if (v <= m * pow) return m * pow;
		}
		return 10 * pow;
	}

	/** Adds a column's segments up to the height the whole bar reaches. */
	function total(bucket: ColumnBucket): number {
		return bucket.segments.reduce((a, v) => a + v, 0);
	}

	const top = $derived(niceCeil(Math.max(1, ...buckets.map(total))));
	const slot = $derived(W / Math.max(1, buckets.length));
	const barW = $derived(Math.max(2, Math.min(16, slot - 2)));

	/** Places a value on the vertical axis, counting down from the top. */
	function y(value: number): number {
		return PAD_TOP + plotH * (1 - value / top);
	}

	/**
	 * Works out where each segment of a stacked bar sits, bottom-up, skipping
	 * the zeroes and leaving a 2px gap between fills so the colours read as
	 * separate bands rather than one block.
	 */
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

	/**
	 * Draws a bar with rounded top corners and a flat baseline, since the top is
	 * the end that carries the value.
	 */
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

	// Hover follows the pointer at the container level: per-bar enter events
	// don't fire during a touch drag (the first-touched element captures the
	// pointer), but container pointermove does.
	let containerEl: HTMLDivElement | undefined = $state();
	let containerW = $state(0);
	let tipW = $state(0);

	/** Picks the column under the pointer from its position across the chart. */
	function hoverFromEvent(e: PointerEvent) {
		if (!containerEl) return;
		const rect = containerEl.getBoundingClientRect();
		const idx = Math.floor(((e.clientX - rect.left) / rect.width) * buckets.length);
		hovered = Math.min(buckets.length - 1, Math.max(0, idx));
	}

	// Tooltip center in pixels, clamped by the measured tooltip width so the
	// box never leaves the container (and therefore never the viewport).
	const tipLeftPx = $derived.by(() => {
		if (hovered === null || containerW === 0) return 0;
		const ideal = (((hovered + 0.5) * slot) / W) * containerW;
		const half = tipW / 2;
		return Math.min(containerW - half - 2, Math.max(half + 2, ideal));
	});
	const tipTop = $derived(hovered === null ? 0 : (y(total(buckets[hovered])) * 100) / height);
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
	<svg viewBox="0 0 {W} {height}" class="w-full" role="img">
		<line x1="0" x2={W} y1={y(top)} y2={y(top)} stroke="#f3f4f6" />
		<line x1="0" x2={W} y1={y(top / 2)} y2={y(top / 2)} stroke="#f3f4f6" />
		<line x1="0" x2={W} y1={y(0)} y2={y(0)} stroke="#e5e7eb" />
		<text x="0" y={y(top) - 3} font-size="9" class="fill-gray-400">{top}</text>

		{#each buckets as bucket, i (i)}
			{@const x = i * slot + (slot - barW) / 2}
			<g>
				{#if hovered === i}
					<rect x={i * slot} y={PAD_TOP} width={slot} height={plotH} fill="#f3f4f6" rx="3" />
				{:else}
					<rect x={i * slot} y={PAD_TOP} width={slot} height={plotH} fill="transparent" />
				{/if}
				<!-- Hovered bar keeps its color and gains a dark outline; the
				     rest of the chart fades back. -->
				<g
					stroke={hovered === i ? '#111827' : 'none'}
					stroke-opacity="0.4"
					opacity={hovered !== null && hovered !== i ? 0.35 : 1}
					style="transition: opacity 120ms"
				>
					{#each stack(bucket.segments) as seg (seg.idx)}
						{#if seg.isTop}
							<path d={roundedTop(x, seg.y, barW, seg.h)} fill={colors[seg.idx]} />
						{:else}
							<rect {x} y={seg.y} width={barW} height={seg.h} fill={colors[seg.idx]} />
						{/if}
					{/each}
				</g>
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
			bind:clientWidth={tipW}
			class="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg bg-gray-900 px-2.5 py-1.5 text-xs whitespace-nowrap text-white shadow-lg"
			style="left: {tipLeftPx}px; top: calc({tipTop}% - 6px)"
		>
			<p class="font-semibold">{bucket.tooltip.heading}</p>
			<div class="mt-1 flex flex-col gap-1">
				{#each bucket.tooltip.rows as row, ri (ri)}
					<div class="flex items-stretch rounded-md bg-white/10 px-2 py-1">
						{#each row as cell, ci (ci)}
							{#if ci > 0}
								<span class="mx-2 w-px shrink-0 self-stretch bg-white/20"></span>
							{/if}
							<span
								class="flex flex-1 items-center gap-1.5 {row.length > 1
									? 'justify-center'
									: 'justify-between'}"
							>
								{#if cell.color}
									<span class="h-2 w-2 shrink-0 rounded-full" style="background:{cell.color}"
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
	{/if}
</div>
