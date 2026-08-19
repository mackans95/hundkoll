// Chart colours, kept together so the contrast pairs stay deliberate.
// The values live in layout.css as --chart-* custom properties, light and
// dark side by side; these var() references are how SVG style attributes
// and the tooltip/legend swatches reach them.

export const WALK_COLOR = 'var(--chart-walk)';
export const WEIGHT_COLOR = 'var(--chart-weight)';

/** Categorical pair (kiss, bajs) plus a neutral for unspecified. */
export const ACCIDENT_COLORS = [
	'var(--chart-accident-1)',
	'var(--chart-accident-2)',
	'var(--chart-accident-3)'
];

/** Emphasis pair: finished carries the story, not-finished is context. */
export const MEAL_COLORS = ['var(--chart-meal-1)', 'var(--chart-meal-2)', 'var(--chart-meal-3)'];
