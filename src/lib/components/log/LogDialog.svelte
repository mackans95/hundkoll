<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { fieldsFor } from '$lib/events/fields';
	import * as locale from '$lib/locale';
	import { createLogSubmit } from '$lib/offline/submit';
	import { growFrom, sheet } from '$lib/transitions';
	import type { EventType } from '$lib/types/domain';
	import DetailFields from './DetailFields.svelte';

	let {
		type,
		nowLocal,
		eventId,
		message,
		origin,
		onClose
	}: {
		type: Pick<EventType, 'id' | 'label' | 'icon'>;
		nowLocal: string;
		eventId: string;
		message: string | null;
		/** The tile this was opened from, so it can grow out of it. */
		origin: DOMRect | null;
		/** Closes the dialog. The page owns this, since it opened it. */
		onClose: () => void;
	} = $props();

	// Read once, on purpose, which is what untrack states. Svelte re-evaluates a
	// transition's parameters when the outro runs, and by then the page has already
	// dropped the dialog this prop came from — reading it again throws, the outro
	// never starts, and the sheet is left in the DOM swallowing every click. It is
	// a snapshot of where the dialog came from in any case, so it has no business
	// being reactive.
	const openedFrom = untrack(() => origin);

	const fields = $derived(fieldsFor(type.id));

	// Saving closes the dialog the same way Avbryt does — neither waits for the
	// server, which is what the queue behind createLogSubmit is for.
	//
	// use:enhance captures this function once and never sees updates, so the
	// $derived alone cannot follow a change of `type` — the {#key} around this
	// dialog in +page.svelte is what remounts form and handler together.
	const submit = $derived(createLogSubmit(type, onClose));

	/** Closes without leaving the page, but stays a real link without JS. */
	function cancel(event: MouseEvent) {
		event.preventDefault();
		onClose();
	}

	// Where the press that led to a click started. A click's target is the common
	// ancestor of press and release, so dragging out of the note field and letting
	// go over the sheet would otherwise read as a tap outside and throw the log
	// away half-typed.
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

<!-- Opened in place by a tile, or server-rendered from ?detail=<id> when the
     tap landed before hydration. Every control degrades to plain HTML: the
     form posts to the action and Avbryt is a link back to "/". -->
<!-- The sheet is presentational: tapping it is a shortcut for Avbryt, which is
     still there for anyone using the keyboard, along with Escape. -->
<div
	role="presentation"
	onpointerdown={(event) => (pressedOn = event.target)}
	onclick={tapOutside}
	transition:sheet|global
	class="fixed inset-0 z-30 flex items-end justify-center bg-black/40 sm:items-center"
>
	<div
		role="dialog"
		aria-modal="true"
		aria-label={locale.log.dialog.ariaLabel(type.label)}
		transition:growFrom|global={{ origin: openedFrom }}
		class="w-full max-w-sm rounded-t-2xl bg-white p-6 shadow-xl sm:rounded-2xl"
	>
		<h2 class="mb-4 text-xl font-bold">{type.icon} {type.label}</h2>

		{#if message}
			<p class="mb-3 rounded-lg bg-red-50 p-3 text-red-800">{message}</p>
		{/if}

		<form
			method="POST"
			action="?/log"
			use:enhance={submit}
			class="flex flex-col gap-3"
		>
			<input
				type="hidden"
				name="type_id"
				value={type.id}
			/>
			<input
				type="hidden"
				name="detailed"
				value="1"
			/>
			<input
				type="hidden"
				name="event_id"
				value={eventId}
			/>

			<label class="flex flex-col gap-1">
				<span class="text-sm font-medium text-gray-700">{locale.log.dialog.time}</span>
				<input
					type="datetime-local"
					name="occurred_at"
					value={nowLocal}
					max={nowLocal}
					required
					class="rounded-lg border-gray-300"
				/>
			</label>

			<DetailFields {fields} />

			<label class="flex flex-col gap-1">
				<span class="text-sm font-medium text-gray-700">{locale.log.dialog.note}</span>
				<textarea
					name="note"
					rows="2"
					class="rounded-lg border-gray-300"></textarea>
			</label>

			<div class="mt-2 flex gap-2">
				<a
					href="/"
					onclick={cancel}
					class="flex-1 btn btn-secondary"
				>
					{locale.log.dialog.cancel}
				</a>
				<button
					type="submit"
					class="flex-1 btn btn-primary">{locale.log.dialog.save}</button
				>
			</div>
		</form>
	</div>
</div>
