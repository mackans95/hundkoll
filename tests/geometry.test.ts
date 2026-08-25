// Where the hover tooltip sits. A tall bar leaves less room above it than
// the box needs, and what overflows the chart is clipped by the card.

import { describe, expect, it } from 'vitest';
import { placeTooltip } from '$lib/components/charts/geometry';

const TIP = 86; // A two-row walk tooltip, measured.
const PLOT = 140; // The chart at 430px wide.

describe('placeTooltip', () => {
	it('sits above a short bar, hanging upward from the bar top', () => {
		expect(placeTooltip(120, TIP, PLOT)).toEqual({ bottomAnchored: true, topPx: 114 });
	});

	it('goes below a tall bar, which is where the room is', () => {
		expect(placeTooltip(20, TIP, PLOT)).toEqual({ bottomAnchored: false, topPx: 26 });
	});

	it('switches sides exactly when the gap and the box stop fitting above', () => {
		expect(placeTooltip(92, TIP, PLOT).bottomAnchored).toBe(true);
		expect(placeTooltip(91.9, TIP, PLOT).bottomAnchored).toBe(false);
	});

	// Bars around the middle of a short chart have room on neither side. The
	// box must stay inside the plot; which bars it covers is secondary.
	it('takes the roomier side when neither fits, and stays in the plot', () => {
		// Just short of fitting above: 85.6px of room, so it pins to the top
		// and still clears the bar.
		expect(placeTooltip(91.6, TIP, PLOT)).toEqual({ bottomAnchored: false, topPx: 0 });
		// Marginally roomier below: pinned to the bottom of the plot instead.
		expect(placeTooltip(69, TIP, PLOT)).toEqual({ bottomAnchored: false, topPx: 54 });
	});

	it('gives up gracefully when the box is taller than the whole plot', () => {
		expect(placeTooltip(30, 200, PLOT)).toEqual({ bottomAnchored: false, topPx: 0 });
	});

	it('hangs upward until it has been measured, as it did before', () => {
		expect(placeTooltip(20, 0, PLOT)).toEqual({ bottomAnchored: true, topPx: 14 });
	});
});
