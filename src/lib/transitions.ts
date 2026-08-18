/**
 * Svelte transitions used by more than one component, or complicated enough to
 * be worth reading on their own.
 */
import { cubicOut } from 'svelte/easing';
import type { TransitionConfig } from 'svelte/transition';

/**
 * What the dialog's movement should be, asked fresh each time so a change of
 * setting is picked up without a reload. Duration is short on purpose: this sits
 * in front of logging a walk, which is the thing the whole app is for.
 *
 * Deliberately not svelte/motion's `prefersReducedMotion`, which builds a
 * MediaQuery at module scope and so would call `window.matchMedia` during server
 * rendering. Transitions only ever run in the browser, so asking here is safe.
 *
 * @example const { reduced, duration } = motion();
 */
function motion(): { reduced: boolean; duration: number } {
	const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
	return { reduced, duration: reduced ? 120 : 240 };
}

/** Where the dialog is growing from, if something on the page opened it. */
export type GrowOptions = { origin: DOMRect | null };

/**
 * Grows the dialog out of the element that opened it, and shrinks it back into
 * it on close. With no origin — a ?detail= dialog rendered by the server, where
 * there was no tap to grow from — it rises from slightly small instead.
 *
 * @example <div transition:growFrom|global={{ origin }}>
 */
export function growFrom(node: Element, { origin }: GrowOptions): TransitionConfig {
	const { reduced, duration } = motion();
	if (reduced) return { duration, css: (t) => `opacity: ${t}` };

	const panel = node.getBoundingClientRect();
	// A zero-width panel would make the ratio infinite. It cannot happen for a
	// laid-out dialog, but the fallback is the one the no-origin case wants anyway.
	const from = origin !== null && panel.width > 0 ? origin : null;
	const scale = from ? from.width / panel.width : 0.92;
	const dx = from ? from.left + from.width / 2 - (panel.left + panel.width / 2) : 0;
	const dy = from ? from.top + from.height / 2 - (panel.top + panel.height / 2) : 0;

	return {
		duration,
		easing: cubicOut,
		// u runs 1 → 0 on the way in, so the panel starts where the tile is and at
		// its size. Opacity is doubled so the panel is solid well before it lands,
		// which stops the text looking like it is being stretched into place.
		css: (t, u) =>
			`transform: translate(${u * dx}px, ${u * dy}px) scale(${1 - u * (1 - scale)});` +
			`opacity: ${Math.min(1, t * 2)}`
	};
}

/**
 * Fades the shaded sheet behind the dialog, over exactly as long as the panel
 * takes, so neither is ever left on screen without the other. It lives here
 * rather than being svelte/transition's `fade` so that the two durations cannot
 * drift apart. The node is unused — the sheet covers the viewport regardless —
 * but a transition is handed one.
 *
 * @example <div transition:sheet|global>
 */
export function sheet(node: Element): TransitionConfig {
	return { duration: motion().duration, css: (t) => `opacity: ${t}` };
}
