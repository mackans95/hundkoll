/**
 * Svelte transitions used by more than one component, or complicated enough to
 * be worth reading on their own.
 */
import { cubicOut } from 'svelte/easing';
import type { TransitionConfig } from 'svelte/transition';

/**
 * Asked fresh each transition, so a changed reduced-motion setting is picked
 * up without a reload. Not svelte/motion's `prefersReducedMotion`, which
 * calls `matchMedia` at module scope and so would break server rendering.
 */
function motion(): { reduced: boolean; duration: number } {
	const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
	return { reduced, duration: reduced ? 120 : 240 };
}

/** Where the dialog is growing from, if something on the page opened it. */
export type GrowOptions = { origin: DOMRect | null };

/**
 * Grows the dialog out of the element that opened it, and shrinks it back on
 * close. With no origin — a server-rendered ?detail= dialog, where there was
 * no tap to grow from — it rises from slightly small instead.
 */
export function growFrom(node: Element, { origin }: GrowOptions): TransitionConfig {
	const { reduced, duration } = motion();
	if (reduced) return { duration, css: (t) => `opacity: ${t}` };

	const panel = node.getBoundingClientRect();
	// A zero-width panel would make the ratio infinite; fall back to no-origin.
	const from = origin !== null && panel.width > 0 ? origin : null;
	const scale = from ? from.width / panel.width : 0.92;
	const dx = from ? from.left + from.width / 2 - (panel.left + panel.width / 2) : 0;
	const dy = from ? from.top + from.height / 2 - (panel.top + panel.height / 2) : 0;

	return {
		duration,
		easing: cubicOut,
		// Opacity doubled: solid well before it lands, so the text never looks
		// stretched into place.
		css: (t, u) =>
			`transform: translate(${u * dx}px, ${u * dy}px) scale(${1 - u * (1 - scale)});` +
			`opacity: ${Math.min(1, t * 2)}`
	};
}

/**
 * Fades the shaded sheet behind the dialog over exactly as long as the panel
 * takes, so neither is ever left on screen without the other — which is why
 * it is not svelte/transition's `fade` with its own duration.
 */
export function sheet(_node: Element): TransitionConfig {
	return { duration: motion().duration, css: (t) => `opacity: ${t}` };
}
