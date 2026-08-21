<script lang="ts">
	import type { DetailField } from '$lib/events/fields';
	import type { EventDetails } from '$lib/types/domain';
	import CountStepper from './CountStepper.svelte';

	let {
		fields,
		values = {}
	}: {
		fields: DetailField[];
		/** What the fields start at — a stored event's details, when editing. */
		values?: EventDetails;
	} = $props();

	/** A stored count, reading the older boolean rows as one. */
	function count(value: unknown): number {
		if (value === true) {
			return 1;
		}
		return typeof value === 'number' && value > 0 ? Math.floor(value) : 0;
	}

	/** A stored number as an input value; blank when there is nothing to show. */
	function number(value: unknown): string {
		return typeof value === 'number' ? String(value) : '';
	}
</script>

<!-- The form is generated from DETAIL_FIELDS, which the action reads back
     when parsing — so a new field only has to be declared once. -->
{#each fields as field (field.name)}
	{#if field.input === 'count'}
		<CountStepper
			name={field.name}
			label={field.label}
			value={count(values[field.name])}
		/>
	{:else if field.input === 'checkbox'}
		<label class="flex min-h-11 items-center gap-2">
			<input
				type="checkbox"
				name={field.name}
				checked={values[field.name] === true}
				class="rounded border-edge-strong"
			/>
			<span class="text-sm font-medium text-ink-label">{field.label}</span>
		</label>
	{:else}
		<label class="flex flex-col gap-1">
			<span class="text-sm font-medium text-ink-label">{field.label}</span>
			<input
				type="number"
				name={field.name}
				inputmode="decimal"
				step={field.step ?? '1'}
				min="0"
				required={field.required ?? false}
				value={number(values[field.name])}
				class="rounded-lg border-edge-strong"
			/>
		</label>
	{/if}
{/each}
