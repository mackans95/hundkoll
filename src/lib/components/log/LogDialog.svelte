<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import ModalSheet from '$lib/components/ModalSheet.svelte';
	import { fieldsFor } from '$lib/events/fields';
	import * as locale from '$lib/locale';
	import { createLogSubmit } from '$lib/offline/submit';
	import type { EventType } from '$lib/types/domain';
	import DetailFields from './DetailFields.svelte';
	import NoteField from './NoteField.svelte';

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

	const fields = $derived(fieldsFor(type.id));

	// What the device itself refused, as opposed to `message`, which is what the
	// server said. Both read the same on screen; only one of them can happen,
	// since a rejected form never reaches the action.
	let rejected = $state<string | null>(null);

	// Saving closes the dialog without waiting for the server — that is what
	// the queue behind createLogSubmit is for. use:enhance captures this
	// function once: the {#key} around this dialog in +page.svelte is what
	// remounts form and handler together when the activity changes.
	const submit = $derived(
		createLogSubmit(type, onClose, (reason) => {
			rejected = reason;
		})
	);

	/** Closes without leaving the page, but stays a real link without JS. */
	function cancel(event: MouseEvent) {
		event.preventDefault();
		onClose();
	}
</script>

<!-- Opened by a tile, or server-rendered from ?detail= when the tap landed
     before hydration; every control degrades to plain HTML. -->
<ModalSheet
	ariaLabel={locale.log.dialog.ariaLabel(type.label)}
	{origin}
	{onClose}
>
	<h2 class="mb-4 text-xl font-bold">{type.icon} {type.label}</h2>

	{#if rejected ?? message}
		<p class="mb-3 rounded-lg bg-danger-surface p-3 text-danger-ink">{rejected ?? message}</p>
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
			<span class="text-sm font-medium text-ink-label">{locale.log.dialog.time}</span>
			<input
				type="datetime-local"
				name="occurred_at"
				value={nowLocal}
				max={nowLocal}
				required
				class="rounded-lg border-edge-strong"
			/>
		</label>

		<DetailFields {fields} />

		<NoteField />

		<div class="mt-2 flex gap-2">
			<a
				href={resolve('/')}
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
</ModalSheet>
