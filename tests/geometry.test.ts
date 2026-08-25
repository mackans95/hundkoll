// Where the hover tooltip sits. It is placed against the screen, not the
// chart: a 255px box has nowhere to go inside a 318px chart that a thumb or
// the card's own edge does not cover. A thumb reaches up the screen, so the
// order of preference is above the touch, then beside it, then below.

import { describe, expect, it } from 'vitest';
import { placeTooltip } from '$lib/components/charts/geometry';

const TIP = { w: 255, h: 86 }; // The walk tooltip, measured.
const PHONE = { w: 430, h: 900 };

describe('placeTooltip', () => {
	it("sits a thumb's width above the pointer when there is room", () => {
		expect(placeTooltip({ x: 215, y: 500 }, TIP, PHONE)).toEqual({
			centerX: 215,
			topPx: 452, // bottom-anchored: the box fills the 86px above this
			bottomAnchored: true
		});
	});

	it('takes the full gap while the screen allows it, and no less', () => {
		// 48 + 86 + an 8px margin is 142: the least room the ideal needs.
		expect(placeTooltip({ x: 215, y: 142 }, TIP, PHONE).bottomAnchored).toBe(true);
		expect(placeTooltip({ x: 215, y: 141 }, TIP, PHONE).bottomAnchored).toBe(false);
	});

	it('holds the box on screen when the column is near an edge', () => {
		expect(placeTooltip({ x: 20, y: 500 }, TIP, PHONE).centerX).toBe(8 + 255 / 2);
		expect(placeTooltip({ x: 420, y: 500 }, TIP, PHONE).centerX).toBe(430 - 8 - 255 / 2);
	});

	it('centres a box too wide to clamp, rather than picking a side', () => {
		expect(placeTooltip({ x: 40, y: 500 }, { w: 420, h: 86 }, PHONE).centerX).toBe(215);
	});

	// Not an edge case: a chart near the top of the screen leaves less than
	// 142px above the finger, and the box still belongs wholly above it.
	it('squeezes up against the top of the screen rather than going below', () => {
		expect(placeTooltip({ x: 215, y: 115 }, TIP, PHONE)).toEqual({
			centerX: 215,
			topPx: 8,
			bottomAnchored: false
		});
	});

	it('goes to the far side when the finger is too high for anything above', () => {
		// Holding the left of the screen: the box lands on the right, clear of it.
		const left = placeTooltip({ x: 60, y: 40 }, TIP, PHONE);
		expect(left).toEqual({ centerX: 430 - 8 - 127.5, topPx: 8, bottomAnchored: false });
		expect(left.centerX - TIP.w / 2).toBeGreaterThan(60);

		// And the mirror image.
		const right = placeTooltip({ x: 380, y: 40 }, TIP, PHONE);
		expect(right.centerX).toBe(8 + 127.5);
		expect(right.centerX + TIP.w / 2).toBeLessThan(380);
	});

	it('falls back to below the pointer only when nothing else is possible', () => {
		// Near the top and in the middle: no room above, and a 255px box
		// cannot clear the middle of a 430px screen either way.
		expect(placeTooltip({ x: 215, y: 40 }, TIP, PHONE)).toEqual({
			centerX: 215,
			topPx: 88,
			bottomAnchored: false
		});
	});

	it('keeps a below-pointer box inside the bottom of the screen', () => {
		expect(placeTooltip({ x: 215, y: 60 }, TIP, { w: 430, h: 150 })).toEqual({
			centerX: 215,
			topPx: 56,
			bottomAnchored: false
		});
	});

	it('anchors upward until the box has been measured', () => {
		expect(placeTooltip({ x: 215, y: 500 }, { w: 0, h: 0 }, PHONE)).toEqual({
			centerX: 215,
			topPx: 452,
			bottomAnchored: true
		});
	});
});
