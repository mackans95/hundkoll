// Chart colours. Each type picks one entry from a curated palette in Settings
// (plan 26); the values live in layout.css as --palette-* custom properties,
// light and dark side by side, and these var() references are how SVG style
// attributes and the tooltip/legend swatches reach them.
//
// The five hues were chosen with the dataviz validator over all pairs, the
// card greys included, in both themes: any two stay apart for deuteranopes
// and protanopes. Rose next to emerald, and violet next to blue, did not.

export type PaletteKey = 'green' | 'blue' | 'amber' | 'violet' | 'pink' | 'slate';

/** A type's colour on its card: `main` for its series, `alt` for a second one. */
export type ChartColor = { main: string; alt: string };

/** How many coloured series a type's card draws, which decides what it may pick. */
export type ChartShape = 'single' | 'paired';

export type PaletteEntry = { key: PaletteKey; label: string; pairs: boolean };

/** In picker order. Skiffer is a deliberate neutral, too close to the card greys to pair. */
export const PALETTE: PaletteEntry[] = [
	{ key: 'green', label: 'Grön', pairs: true },
	{ key: 'blue', label: 'Blå', pairs: true },
	{ key: 'amber', label: 'Bärnsten', pairs: true },
	{ key: 'violet', label: 'Lila', pairs: true },
	{ key: 'pink', label: 'Rosa', pairs: true },
	{ key: 'slate', label: 'Skiffer', pairs: false }
];

/** The types that have a card on Statistik, and so a colour to choose. */
export const CHARTED_TYPES: Record<string, ChartShape> = {
	// codegen:charted-types — npm run new-event inserts generated cards here
	walk: 'single',
	weight: 'single',
	car_ride: 'single',
	meal: 'paired',
	accident: 'paired',
	alone: 'paired'
};

/** What each type looked like before it was configurable; anything else is Skiffer. */
const DEFAULT_COLORS: Record<string, PaletteKey> = {
	walk: 'green',
	meal: 'green',
	alone: 'green',
	weight: 'blue',
	accident: 'amber'
};

/** The "not this" series: Matning's ej uppäten, Ensamtid's orolig, Olyckor's ospecificerat. */
export const NEUTRAL_COLOR = 'var(--chart-neutral)';
/** Matning's okänt, one step quieter than the neutral beside it. */
export const NEUTRAL_SOFT_COLOR = 'var(--chart-neutral-soft)';

/** The entries a type may pick: a paired card cannot take the neutral. */
export function paletteFor(typeId: string): PaletteEntry[] {
	return CHARTED_TYPES[typeId] === 'paired' ? PALETTE.filter((entry) => entry.pairs) : PALETTE;
}

/**
 * The key a type is drawn in: the stored one if this type may use it, else
 * its default. A stale key, from a palette since re-stepped, reads as unset.
 */
export function chartColorKey(typeId: string, stored: string | null | undefined): PaletteKey {
	const allowed = paletteFor(typeId);
	return (
		allowed.find((entry) => entry.key === stored)?.key ??
		allowed.find((entry) => entry.key === DEFAULT_COLORS[typeId])?.key ??
		'slate'
	);
}

/** The var() references for one palette entry. */
export function chartColor(key: PaletteKey): ChartColor {
	return { main: `var(--palette-${key})`, alt: `var(--palette-${key}-alt)` };
}

/** Olyckor: kiss, bajs, ospecificerat. */
export function accidentColors(color: ChartColor): string[] {
	return [color.main, color.alt, NEUTRAL_COLOR];
}

/** Ensamtid: lugn, orolig, vet ej. Vet ej separates from lugn by lightness. */
export function aloneColors(color: ChartColor): string[] {
	return [color.main, NEUTRAL_COLOR, color.alt];
}

/** Matning: uppäten carries the story, the two greys are context. */
export function mealColors(color: ChartColor): string[] {
	return [color.main, NEUTRAL_COLOR, NEUTRAL_SOFT_COLOR];
}
