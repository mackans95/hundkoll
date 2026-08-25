<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import type { SubmitFunction } from '@sveltejs/kit';
	import ModalSheet from '$lib/components/ModalSheet.svelte';
	import { fieldsFor } from '$lib/events/fields';
	import { detailSummary } from '$lib/events/summary';
	import * as format from '$lib/format';
	import * as locale from '$lib/locale';
	import * as time from '$lib/time';
	import type { EventRow } from '$lib/types/domain';
	import DetailFields from './DetailFields.svelte';
	import NoteField from './NoteField.svelte';

	let {
		event,
		message,
		origin,
		onClose
	}: {
		event: EventRow;
		message: string | null;
		/** The row this was opened from, so it can grow out of it. */
		origin: DOMRect | null;
		onClose: () => void;
	} = $props();

	// Editing is a mode of this sheet rather than a second one: the row is
	// already here, so switching needs no round trip.
	let editing = $state(false);
	// Ta bort asks once by turning into its own confirmation, rather than
	// raising a browser dialog the rest of the app never uses.
	let confirmingDelete = $state(false);

	/**
	 * Closes the sheet once the server has acted, since this row is then
	 * either gone or out of date — the page owns the sheet, so it has to be
	 * told. A failure deliberately leaves it open, carrying the message.
	 */
	const submit: SubmitFunction =
		() =>
		async ({ result, update }) => {
			await update();
			if (result.type === 'redirect') {
				onClose();
			}
		};

	const label = $derived(event.type?.label ?? event.type_id);
	const fields = $derived(fieldsFor(event.type_id));
	const summary = $derived(detailSummary(event.type_id, event.details));
	const occurredLocal = $derived(time.stockholmForInput(new Date(event.occurred_at)));
	const nowLocal = time.stockholmNowForInput();

	/** Closes without leaving the page, but stays a real link without JS. */
	function close(clicked: MouseEvent) {
		clicked.preventDefault();
		onClose();
	}
</script>

<!-- Opened by tapping a stored row, or server-rendered from ?event= before
     hydration. Editing is online-only: unlike logging, fixing a mistake is a
     couch activity, so these post straight to the server. -->
<ModalSheet
	ariaLabel={locale.log.event.ariaLabel(label)}
	{origin}
	{onClose}
>
	<h2 class="mb-1 text-xl font-bold">{event.type?.icon} {label}</h2>
	<p class="mb-4 text-sm text-ink-muted">
		{locale.log.event.loggedAt}
		<time datetime={event.occurred_at}>{format.eventTime(new Date(event.occurred_at))}</time>
	</p>

	{#if message}
		<p class="mb-3 rounded-lg bg-danger-surface p-3 text-danger-ink">{message}</p>
	{/if}

	{#if editing}
		<form
			method="POST"
			action="?/update"
			use:enhance={submit}
			class="flex flex-col gap-3"
		>
			<input
				type="hidden"
				name="event_id"
				value={event.id}
			/>

			<label class="flex flex-col gap-1">
				<span class="text-sm font-medium text-ink-label">{locale.log.dialog.time}</span>
				<input
					type="datetime-local"
					name="occurred_at"
					value={occurredLocal}
					max={nowLocal}
					required
					class="rounded-lg border-edge-strong"
				/>
			</label>

			<DetailFields
				{fields}
				values={event.details}
			/>

			<NoteField
				value={event.note ?? ''}
				open={Boolean(event.note)}
			/>

			<div class="mt-2 flex gap-2">
				<button
					type="button"
					onclick={() => (editing = false)}
					class="flex-1 btn btn-secondary"
				>
					{locale.log.event.cancelEdit}
				</button>
				<button
					type="submit"
					class="flex-1 btn btn-primary">{locale.log.event.save}</button
				>
			</div>
		</form>
	{:else}
		<dl class="flex flex-col gap-1 text-sm">
			{#if summary}
				<dd>{summary}</dd>
			{:else}
				<dd class="text-ink-muted">{locale.log.event.noDetails}</dd>
			{/if}
			{#if event.note}
				<dd class="whitespace-pre-wrap text-ink-soft">{event.note}</dd>
			{/if}
		</dl>

		<div class="mt-4 flex gap-2">
			<a
				href={resolve('/')}
				onclick={close}
				class="flex-1 btn btn-secondary"
			>
				{locale.log.event.close}
			</a>
			<button
				type="button"
				onclick={() => (editing = true)}
				class="flex-1 btn btn-primary">{locale.log.event.edit}</button
			>
		</div>

		<form
			method="POST"
			action="?/delete"
			use:enhance={submit}
			class="mt-2"
		>
			<input
				type="hidden"
				name="event_id"
				value={event.id}
			/>
			<!-- Arming is client-side; without JavaScript the first press posts,
			     which is the honest fallback for a form with no confirm step. -->
			<button
				type="submit"
				onclick={(pressed) => {
					if (!confirmingDelete) {
						pressed.preventDefault();
						confirmingDelete = true;
					}
				}}
				class="w-full btn text-danger-ink {confirmingDelete
					? 'bg-danger-badge font-semibold'
					: 'hover:bg-danger-surface'}"
			>
				{confirmingDelete ? locale.log.event.confirmDelete : locale.log.event.delete}
			</button>
		</form>
	{/if}
</ModalSheet>
