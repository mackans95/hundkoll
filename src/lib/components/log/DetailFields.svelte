<script lang="ts">
	import type { DetailField } from '$lib/events/fields';
	import CountStepper from './CountStepper.svelte';

	let { fields }: { fields: DetailField[] } = $props();
</script>

<!-- The form is generated from DETAIL_FIELDS, which the action reads back
     when parsing — so a new field only has to be declared once. -->
{#each fields as field (field.name)}
	{#if field.input === 'count'}
		<CountStepper name={field.name} label={field.label} />
	{:else if field.input === 'checkbox'}
		<label class="flex min-h-11 items-center gap-2">
			<input type="checkbox" name={field.name} class="rounded border-gray-300" />
			<span class="text-sm font-medium text-gray-700">{field.label}</span>
		</label>
	{:else}
		<label class="flex flex-col gap-1">
			<span class="text-sm font-medium text-gray-700">{field.label}</span>
			<input
				type="number"
				name={field.name}
				inputmode="decimal"
				step={field.step ?? '1'}
				min="0"
				required={field.required ?? false}
				class="rounded-lg border-gray-300"
			/>
		</label>
	{/if}
{/each}
