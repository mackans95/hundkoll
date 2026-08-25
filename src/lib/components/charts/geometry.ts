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

/** Where the hover tooltip goes, in viewport pixels. */
export type TooltipPlacement = {
	/** The centre of the box; a transform does the half-width offset. */
	centerX: number;
	topPx: number;
	/** The box hangs upward from `topPx`, which a transform does for free. */
	bottomAnchored: boolean;
};

/** The least clearance worth calling clear of a fingertip. */
const MIN_GAP = 10;

/**
 * Places the tooltip against the screen rather than the chart, which is what
 * makes it work on a phone: a 255px box has nowhere to go inside a 318px
 * chart that a thumb or the card's own edge does not cover. The box is
 * `fixed`, so only the viewport bounds it.
 *
 * A thumb reaches up the screen, so the room it leaves is above the touch —
 * `gap` is fingertip-sized rather than decorative. Four placements, in order
 * of how much of the finger they clear:
 *
 * 1. above the pointer, the full gap clear of it;
 * 2. squeezed up against the top of the screen, still wholly above it;
 * 3. beside the pointer, pinned to whichever edge clears it — for when the
 *    chart is near the top of the screen and there is no room above at all;
 * 4. below it, which the hand covers, when nothing else is possible.
 */
export function placeTooltip(
	anchor: { x: number; y: number },
	tip: { w: number; h: number },
	viewport: { w: number; h: number },
	gap = 28,
	edge = 8
): TooltipPlacement {
	const half = tip.w / 2;
	// A box too wide to clamp into the viewport is centred in it instead.
	const centerX =
		tip.w + edge * 2 >= viewport.w
			? viewport.w / 2
			: Math.min(viewport.w - edge - half, Math.max(edge + half, anchor.x));

	// Bottom-anchored on the pointer needs no height, which is also what
	// places the box on the frame before it has been measured.
	if (tip.h === 0 || anchor.y - gap - tip.h >= edge) {
		return { centerX, topPx: anchor.y - gap, bottomAnchored: true };
	}

	if (edge + tip.h + MIN_GAP <= anchor.y) {
		return { centerX, topPx: edge, bottomAnchored: false };
	}

	// Vertically there is nothing left, so try sideways: the box goes to the
	// far edge, opposite the hand, and counts only if the pointer ends up
	// outside it. Hold the left of the screen and it lands on the right.
	const middleY = Math.max(edge, Math.min(anchor.y - tip.h / 2, viewport.h - edge - tip.h));
	const far = anchor.x <= viewport.w / 2 ? viewport.w - edge - half : edge + half;
	if (far - half >= anchor.x + MIN_GAP || far + half <= anchor.x - MIN_GAP) {
		return { centerX: far, topPx: middleY, bottomAnchored: false };
	}

	return {
		centerX,
		topPx: Math.max(edge, Math.min(anchor.y + gap, viewport.h - edge - tip.h)),
		bottomAnchored: false
	};
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
