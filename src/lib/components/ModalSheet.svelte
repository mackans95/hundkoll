<script lang="ts">
	import { untrack } from 'svelte';
	import type { Snippet } from 'svelte';
	import { growFrom, sheet } from '$lib/transitions';

	let {
		ariaLabel,
		origin = null,
		onClose,
		centered = false,
		children
	}: {
		ariaLabel: string;
		/**
		 * Centre on phones too, instead of sitting on the bottom edge. The log
		 * dialogs stay at the bottom for thumb reach; a long form like Logga
		 * flera reads better in the middle.
		 */
		centered?: boolean;
		/** The element this grew out of, so it can shrink back into it. */
		origin?: DOMRect | null;
		/** Closes the sheet. The page owns this, since it opened it. */
		onClose: () => void;
		children: Snippet;
	} = $props();

	// Read once, on purpose. Svelte re-evaluates a transition's parameters when
	// the outro runs, by which point the page has dropped the state this prop
	// came from — reading it again throws, the outro never starts, and the
	// sheet is left on screen as an invisible layer eating every click.
	const openedFrom = untrack(() => origin);

	// Where the press that led to a click started: dragging out of a text
	// field and releasing over the sheet must not read as a tap outside.
	let pressedOn: EventTarget | null = null;

	/** Closes when both the press and the release landed on the sheet itself. */
	function tapOutside(event: MouseEvent & { currentTarget: EventTarget }) {
		const sheetItself = event.currentTarget;
		if (event.target === sheetItself && pressedOn === sheetItself) onClose();
	}

	function keydown(event: KeyboardEvent) {
		if (event.key === 'Escape') onClose();
	}
</script>

<svelte:window onkeydown={keydown} />

<!-- Tapping the shaded backdrop is a shortcut for closing, alongside Escape. -->
<div
	role="presentation"
	onpointerdown={(event) => (pressedOn = event.target)}
	onclick={tapOutside}
	transition:sheet|global
	class={[
		'fixed inset-0 z-30 flex justify-center bg-scrim sm:items-center',
		centered ? 'items-center px-4' : 'items-end'
	]}
>
	<div
		role="dialog"
		aria-modal="true"
		aria-label={ariaLabel}
		transition:growFrom|global={{ origin: openedFrom }}
		class={[
			'w-full max-w-sm bg-surface-raised p-6 shadow-xl sm:rounded-2xl',
			centered ? 'rounded-2xl' : 'rounded-t-2xl'
		]}
	>
		{@render children()}
	</div>
</div>
