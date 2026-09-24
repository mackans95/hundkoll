<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { untrack } from 'svelte';
	import ModalSheet from '$lib/components/ModalSheet.svelte';
	import { rowName } from '$lib/events/bulk';
	import { fieldsFor } from '$lib/events/fields';
	import * as format from '$lib/format';
	import * as locale from '$lib/locale';
	import type { EventType } from '$lib/types/domain';
	import DetailFields from './DetailFields.svelte';
	import NoteField from './NoteField.svelte';

	let {
		day,
		types,
		rowIds,
		message,
		onClose
	}: {
		/** The Stockholm day every row lands on; the rows carry only a clock time. */
		day: string;
		/** The types a row may be; the absence type is left out by the page. */
		types: EventType[];
		/**
		 * Ids for the starting rows, made by the server so the pre-hydration
		 * render and the client agree. Each travels as its row's event_id, so a
		 * double submit collides on the key rather than logging the day twice.
		 */
		rowIds: string[];
		message: string | null;
		onClose: () => void;
	} = $props();

	type Row = { id: string; typeId: string };

	// Rows are keyed by id and named by position, so removing one renumbers the
	// rest and the server sees r0…rN with no gaps to wonder about. The ids are
	// read once on purpose: they seed the rows, and the rows are the state.
	let rows = $state<Row[]>(
		untrack(() => rowIds).map((id) => ({ id, typeId: types[0]?.id ?? 'walk' }))
	);

	function addRow() {
		rows.push({ id: crypto.randomUUID(), typeId: rows.at(-1)?.typeId ?? types[0]?.id ?? 'walk' });
	}

	function removeRow(id: string) {
		rows = rows.filter((row) => row.id !== id);
	}

	/**
	 * Closes once the rows have landed; the redirect that follows reloads the
	 * day. A failure leaves the sheet open with every row as it was — enhance
	 * resets a form on success only.
	 */
	const submit: SubmitFunction =
		() =>
		async ({ result, update }) => {
			await update();
			if (result.type === 'redirect') {
				onClose();
			}
		};

	/** Closes without leaving the page, but stays a real link without JS. */
	function cancel(clicked: MouseEvent) {
		clicked.preventDefault();
		onClose();
	}
</script>

<!-- Opened from the selected day's card, or server-rendered from ?add before
     hydration. Three rows to start, like lines on the paper; a row with no
     time is skipped by the server, so an unused slot costs nothing. -->
<ModalSheet
	ariaLabel={locale.history.bulk.ariaLabel(format.dayHeading(day))}
	{onClose}
>
	<h2 class="mb-4 text-xl font-bold">{locale.history.bulk.heading(format.dayHeading(day))}</h2>

	{#if message}
		<p class="mb-3 rounded-lg bg-danger-surface p-3 text-danger-ink">{message}</p>
	{/if}

	<!-- The action carries the view: `?/bulk` alone would replace the query
	     string, and the redirect back would land on the current month with no
	     day selected. -->
	<form
		method="POST"
		action="?/bulk&month={day.slice(0, 7)}&day={day}"
		use:enhance={submit}
		class="flex max-h-[70dvh] flex-col gap-3 overflow-y-auto"
	>
		<input
			type="hidden"
			name="day"
			value={day}
		/>

		{#each rows as row, index (row.id)}
			<fieldset class="flex flex-col gap-2 rounded-xl border border-edge p-3">
				<input
					type="hidden"
					name={rowName(index, 'event_id')}
					value={row.id}
				/>
				<div class="flex items-end gap-2">
					<label class="flex min-w-0 flex-1 flex-col gap-1">
						<span class="text-sm font-medium text-ink-label">{locale.history.bulk.activity}</span>
						<select
							name={rowName(index, 'type_id')}
							bind:value={row.typeId}
							class="w-full rounded-lg border-edge-strong"
						>
							{#each types as type (type.id)}
								<option value={type.id}>{type.icon} {type.label}</option>
							{/each}
						</select>
					</label>
					<label class="flex flex-col gap-1">
						<span class="text-sm font-medium text-ink-label">{locale.history.bulk.time}</span>
						<input
							type="time"
							name={rowName(index, 'time')}
							class="w-28 rounded-lg border-edge-strong"
						/>
					</label>
					{#if rows.length > 1}
						<button
							type="button"
							aria-label={locale.history.bulk.removeRow(index + 1)}
							onclick={() => removeRow(row.id)}
							class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-lg text-ink-muted transition-colors hover:bg-surface-hover"
						>
							×
						</button>
					{/if}
				</div>

				<!-- Keyed on the type, so switching it rebuilds the fields rather
				     than leaving a walk's steppers under a meal. -->
				{#key row.typeId}
					<DetailFields
						fields={fieldsFor(row.typeId)}
						prefix={rowName(index, '')}
					/>
				{/key}
				<NoteField name={rowName(index, 'note')} />
			</fieldset>
		{/each}

		<button
			type="button"
			onclick={addRow}
			class="min-h-11 self-start text-sm font-medium text-ink-muted underline"
		>
			{locale.history.bulk.addRow}
		</button>

		<div class="mt-2 flex gap-2">
			<a
				href="?month={day.slice(0, 7)}&day={day}"
				onclick={cancel}
				class="flex-1 btn btn-secondary"
			>
				{locale.log.dialog.cancel}
			</a>
			<button
				type="submit"
				class="flex-1 btn btn-primary">{locale.history.bulk.save}</button
			>
		</div>
	</form>
</ModalSheet>
