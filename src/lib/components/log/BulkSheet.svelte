<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { untrack } from 'svelte';
	import ModalSheet from '$lib/components/ModalSheet.svelte';
	import { foldedText, rowFields, rowName } from '$lib/events/bulk';
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

	/** `summary` is the folded line, taken when the row is folded. */
	type Row = { id: string; typeId: string; folded: boolean; summary: string };

	const firstType = $derived(types[0]?.id ?? 'walk');

	// Rows are keyed by id and named by position, so removing one renumbers the
	// rest and the server sees r0…rN with no gaps to wonder about. The ids are
	// read once on purpose: they seed the rows, and the rows are the state.
	let rows = $state<Row[]>(
		untrack(() => rowIds).map((id) => ({
			id,
			typeId: untrack(() => firstType),
			folded: false,
			summary: ''
		}))
	);

	function addRow() {
		rows.push({
			id: crypto.randomUUID(),
			typeId: rows.at(-1)?.typeId ?? firstType,
			folded: false,
			summary: ''
		});
	}

	function removeRow(id: string) {
		rows = rows.filter((row) => row.id !== id);
	}

	/**
	 * Folds or unfolds a row. Folding only hides the fields — they stay in the
	 * form and still post — and snapshots the summary, which cannot go stale
	 * because nothing can be edited while it shows.
	 */
	function toggle(row: Row, index: number, form: HTMLFormElement | null) {
		if (!row.folded) {
			const type = types.find((candidate) => candidate.id === row.typeId);
			row.summary =
				type && form
					? foldedText(type, rowFields(new FormData(form), index))
					: locale.history.bulk.rowHeading(index + 1);
		}
		row.folded = !row.folded;
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
     hydration. One row to start and Ny rad for each line after; a row with no
     time is skipped by the server, so one added by mistake costs nothing. -->
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

				<!-- The header is the whole row when folded, and Ta bort lives in it
				     either way, so removing never needs unfolding first. -->
				<div class="flex items-center gap-2">
					<button
						type="button"
						aria-expanded={!row.folded}
						onclick={(event) => toggle(row, index, event.currentTarget.form)}
						class="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left"
					>
						<span
							class="shrink-0 text-ink-muted"
							aria-hidden="true">{row.folded ? '▸' : '▾'}</span
						>
						<span class={['truncate', row.folded ? 'font-medium' : 'text-sm text-ink-muted']}>
							{row.folded ? row.summary : locale.history.bulk.rowHeading(index + 1)}
						</span>
					</button>
					{#if rows.length > 1}
						<button
							type="button"
							aria-label={locale.history.bulk.removeRow(index + 1)}
							onclick={() => removeRow(row.id)}
							class="min-h-11 shrink-0 rounded-lg px-3 text-sm font-medium text-danger-ink transition-colors hover:bg-danger-surface"
						>
							{locale.history.bulk.remove}
						</button>
					{/if}
				</div>

				<!-- Hidden, not removed: a folded row's fields still post. -->
				<div class={['flex flex-col gap-2', row.folded && 'hidden']}>
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
				</div>
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
