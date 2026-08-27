<script lang="ts">
	import { fieldsRevealedBy, type DetailField } from '$lib/events/fields';
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

	// Revealed fields are rendered by the reveal that uncovers them, not by the
	// top-level loop, so they appear once and inside their block.
	const topLevel = $derived(fields.filter((field) => !field.revealedBy));

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

<!-- One input, whichever kind it is. A revealed field renders through this
     snippet exactly as a top-level one does, so revealing a number or a count
     needs no rendering of its own. -->
{#snippet input(field: DetailField)}
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
{/snippet}

<!-- The form is generated from DETAIL_FIELDS, which the action reads back
     when parsing — so a new field only has to be declared once. -->
{#each topLevel as field (field.name)}
	{#if field.input === 'reveal'}
		<!-- The reveal is CSS, not state: peer-checked matches the immediately
		     preceding sibling input, which is why the checkbox sits beside its
		     label here instead of inside it. That keeps the block working in the
		     server-rendered ?detail= dialog with no JavaScript at all — and being
		     a sibling rather than an ancestor means a ticked cause cannot hold
		     its own reveal open. -->
		<div class="grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-3">
			<input
				id={field.name}
				type="checkbox"
				name={field.name}
				checked={values[field.name] === true}
				class="peer rounded border-edge-strong"
			/>
			<label
				for={field.name}
				class="text-sm font-medium text-ink-label">{field.label}</label
			>
			<div class="col-span-2 ml-6 hidden flex-col gap-3 peer-checked:flex">
				{#each fieldsRevealedBy(fields, field.name) as revealed (revealed.name)}
					{@render input(revealed)}
				{/each}
			</div>
		</div>
	{:else}
		{@render input(field)}
	{/if}
{/each}
