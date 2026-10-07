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
export const CHARTED_TYPES: Record<string, true> = {
	// codegen:charted-types — npm run new-event inserts generated cards here
	walk: true,
	meal: true,
	accident: true,
	weight: true,
	alone: true,
	car_ride: true
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

/**
 * The entries a chart may pick: one with a second series, a split chart,
 * cannot take the neutral (see chartPaired in cardSpec.ts).
 */
export function paletteFor(paired: boolean): PaletteEntry[] {
	return paired ? PALETTE.filter((entry) => entry.pairs) : PALETTE;
}

/**
 * The key a type is drawn in: the stored one if this type may use it, else
 * its default. A stale key, from a palette since re-stepped, reads as unset.
 */
export function chartColorKey(
	typeId: string,
	stored: string | null | undefined,
	paired: boolean
): PaletteKey {
	const allowed = paletteFor(paired);
	return (
		allowed.find((entry) => entry.key === stored)?.key ??
		allowed.find((entry) => entry.key === (DEFAULT_COLORS[typeId] ?? 'slate'))?.key ??
		allowed[0].key
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
