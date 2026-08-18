// Pure geometry for the stacked-column chart: values in, coordinates out.
// Lives apart from StackedColumns.svelte so the component is left with only
// the reactive parts — state, scales and markup.

/** One drawn segment of a stacked bar, placed and sized in SVG coordinates. */
export type StackedSegment = { idx: number; y: number; h: number; isTop: boolean };

/**
 * Rounds an axis maximum up to a number a reader can divide by eye, so the
 * gridline halfway up means something.
 * 7 → 10, 23 → 25
 */
export function niceCeil(v: number): number {
	if (v <= 5) return Math.ceil(v);
	const pow = 10 ** Math.floor(Math.log10(v));
	for (const m of [1, 2, 2.5, 5, 10]) {
		if (v <= m * pow) return m * pow;
	}
	return 10 * pow;
}

/** Adds a column's segments up to the height the whole bar reaches. */
export function total(segments: number[]): number {
	return segments.reduce((a, v) => a + v, 0);
}

/**
 * Works out where each segment of a stacked bar sits, bottom-up, skipping the
 * zeroes and leaving a 2px gap between fills so the colours read as separate
 * bands rather than one block. `y` is the chart's vertical scale.
 */
export function stack(segments: number[], y: (value: number) => number): StackedSegment[] {
	const nonZero = segments.map((v, idx) => ({ v, idx })).filter((s) => s.v > 0);
	const out: StackedSegment[] = [];
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
export function roundedTop(x: number, yy: number, w: number, h: number): string {
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
