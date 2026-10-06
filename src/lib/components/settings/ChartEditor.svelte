<script lang="ts">
	import * as locale from '$lib/locale';

	type Chart = {
		kind: 'bars' | 'timeline';
		split: string;
		picker: boolean;
		tooltip: 'text' | 'emoji';
		field: string;
	};
	type Option = { key: string; label: string };

	let {
		chart,
		splits,
		fields,
		onedit
	}: {
		chart: Chart;
		/** Every split the type's fields allow; the first is no split. */
		splits: Option[];
		/** The number fields a timeline may plot; none means no timeline. */
		fields: Option[];
		/** Told of each change, with whether the chart now draws a second series. */
		onedit?: (paired: boolean) => void;
	} = $props();

	const words = locale.settings.chart;

	// Edited here and posted with the page's Spara. Without JS every control
	// shows, and the server reads only the ones its kind uses.
	let kind = $derived(chart.kind);
	let split = $derived(chart.split);
	const changed = () => onedit?.(kind === 'bars' && split !== 'none');

	const RADIO =
		'flex flex-1 cursor-pointer items-center justify-center rounded-md py-1.5 text-sm font-medium text-ink-muted has-checked:bg-surface-raised has-checked:text-ink has-checked:shadow-sm';
</script>

<!-- Says the chart's fields were on the page. -->
<input
	type="hidden"
	name="chart_present"
	value="1"
/>
<div class="flex flex-col gap-3 rounded-2xl border border-edge bg-surface-raised px-4 py-3">
	{#if fields.length > 0}
		<fieldset class="flex rounded-lg bg-surface-hover p-1">
			<legend class="sr-only">{words.kind}</legend>
			{#each [{ value: 'bars', label: words.bars }, { value: 'timeline', label: words.timeline }] as option (option.value)}
				<label class={RADIO}>
					<input
						type="radio"
						name="chart_kind"
						value={option.value}
						bind:group={kind}
						onchange={changed}
						class="sr-only"
					/>
					{option.label}
				</label>
			{/each}
		</fieldset>
	{:else}
		<input
			type="hidden"
			name="chart_kind"
			value="bars"
		/>
	{/if}

	{#if kind === 'bars'}
		<label class="flex flex-col gap-1 text-sm text-ink-muted">
			{words.split}
			<select
				name="chart_split"
				bind:value={split}
				onchange={changed}
				class="rounded-lg border-edge-strong text-sm text-ink"
			>
				{#each splits as option (option.key)}
					<option value={option.key}>{option.label}</option>
				{/each}
			</select>
		</label>
		<label class="flex items-center justify-between gap-3">
			<span class="text-sm font-medium">{words.picker}</span>
			<input
				type="hidden"
				name="chart_picker"
				value="false"
			/>
			<input
				type="checkbox"
				name="chart_picker"
				value="true"
				checked={chart.picker}
				class="size-6 rounded border-edge-strong text-emerald-600"
			/>
		</label>
		<fieldset class="flex flex-col gap-1">
			<legend class="text-sm text-ink-muted">{words.tooltip}</legend>
			<div class="flex rounded-lg bg-surface-hover p-1">
				{#each [{ value: 'text', label: words.text }, { value: 'emoji', label: words.emoji }] as option (option.value)}
					<label class={RADIO}>
						<input
							type="radio"
							name="chart_tooltip"
							value={option.value}
							checked={chart.tooltip === option.value}
							class="sr-only"
						/>
						{option.label}
					</label>
				{/each}
			</div>
		</fieldset>
	{:else}
		<label class="flex flex-col gap-1 text-sm text-ink-muted">
			{words.field}
			<select
				name="chart_field"
				class="rounded-lg border-edge-strong text-sm text-ink"
			>
				{#each fields as option (option.key)}
					<option
						value={option.key}
						selected={option.key === chart.field}>{option.label}</option
					>
				{/each}
			</select>
		</label>
	{/if}
</div>
