<script lang="ts">
	import * as locale from '$lib/locale';
	import MoveButtons from './MoveButtons.svelte';

	type Detail = { key: string; label: string; on: boolean };
	type Chart = {
		kind: 'bars' | 'timeline';
		split: string;
		picker: boolean;
		tooltip: 'text' | 'emoji';
		field: string;
		every: boolean;
		details: Detail[];
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
	let points = $derived(chart.every ? 'every' : 'average');
	let details = $derived(chart.details.map((detail) => ({ ...detail })));
	let field = $derived(chart.field);
	// What a timeline's tooltip can't show: its own plotted value, and, for a
	// single event, a count, a gap or a share. Kept and posted, just not offered.
	const offered = (key: string) => {
		if (kind !== 'timeline') return true;
		if (key === `avg:${field}`) return false;
		return points === 'average' || !(key === 'count' || key === 'gap' || key.startsWith('share:'));
	};
	const changed = () => onedit?.(kind === 'bars' && split !== 'none');

	function move(from: number, to: number) {
		const next = [...details];
		[next[from], next[to]] = [next[to], next[from]];
		details = next;
		changed();
	}

	const SEGMENTS = 'flex rounded-lg bg-surface-hover p-1';
	const SEGMENT =
		'flex flex-1 cursor-pointer items-center justify-center rounded-md py-1.5 text-sm font-medium text-ink-muted has-checked:bg-surface-raised has-checked:text-ink has-checked:shadow-sm';
	const SELECT = 'rounded-lg border-edge-strong text-sm text-ink';
	const CHECK = 'size-6 rounded border-edge-strong text-emerald-600';
</script>

{#snippet segmented(
	name: string,
	options: { value: string; label: string }[],
	checked: string,
	bind?: 'kind' | 'points'
)}
	<div class={SEGMENTS}>
		{#each options as option (option.value)}
			<label class={SEGMENT}>
				{#if bind === 'kind'}
					<input
						type="radio"
						{name}
						value={option.value}
						bind:group={kind}
						onchange={changed}
						class="sr-only"
					/>
				{:else if bind === 'points'}
					<input
						type="radio"
						{name}
						value={option.value}
						bind:group={points}
						onchange={changed}
						class="sr-only"
					/>
				{:else}
					<input
						type="radio"
						{name}
						value={option.value}
						checked={checked === option.value}
						class="sr-only"
					/>
				{/if}
				{option.label}
			</label>
		{/each}
	</div>
{/snippet}

<!-- Say the chart's fields, and its tooltip list, were on the page. -->
<input
	type="hidden"
	name="chart_present"
	value="1"
/>
<div class="flex flex-col gap-3 rounded-2xl border border-edge bg-surface-raised px-4 py-3">
	{#if fields.length > 0}
		<fieldset>
			<legend class="sr-only">{words.kind}</legend>
			{@render segmented(
				'chart_kind',
				[
					{ value: 'bars', label: words.bars },
					{ value: 'timeline', label: words.timeline }
				],
				kind,
				'kind'
			)}
		</fieldset>
	{:else}
		<input
			type="hidden"
			name="chart_kind"
			value="bars"
		/>
	{/if}

	{#if kind === 'timeline'}
		<label class="flex flex-col gap-1 text-sm text-ink-muted">
			{words.field}
			<select
				name="chart_field"
				bind:value={field}
				class={SELECT}
			>
				{#each fields as option (option.key)}
					<option value={option.key}>{option.label}</option>
				{/each}
			</select>
		</label>
		<fieldset class="flex flex-col gap-1">
			<legend class="text-sm text-ink-muted">{words.points}</legend>
			{@render segmented(
				'chart_points',
				[
					{ value: 'every', label: words.every },
					{ value: 'average', label: words.average }
				],
				points,
				'points'
			)}
		</fieldset>
	{:else}
		<label class="flex flex-col gap-1 text-sm text-ink-muted">
			{words.split}
			<select
				name="chart_split"
				bind:value={split}
				onchange={changed}
				class={SELECT}
			>
				{#each splits as option (option.key)}
					<option value={option.key}>{option.label}</option>
				{/each}
			</select>
		</label>
	{/if}

	<!-- Tabs: the bars' periods, or an average timeline's; an every-event line has none. -->
	{#if kind === 'bars' || points === 'average'}
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
				class={CHECK}
			/>
		</label>
	{/if}

	<fieldset class="flex flex-col gap-1">
		<legend class="text-sm text-ink-muted">{words.tooltip}</legend>
		{@render segmented(
			'chart_tooltip',
			[
				{ value: 'text', label: words.text },
				{ value: 'emoji', label: words.emoji }
			],
			chart.tooltip
		)}
	</fieldset>

	<fieldset class="flex flex-col gap-1">
		<legend class="text-sm text-ink-muted">{words.details}</legend>
		<input
			type="hidden"
			name="details_present"
			value="1"
		/>
		<div class="flex flex-col divide-y divide-edge-soft">
			{#each details as detail, i (detail.key)}
				<div class="items-center gap-2 py-1.5 {offered(detail.key) ? 'flex' : 'hidden'}">
					<input
						type="hidden"
						name="detail"
						value={detail.key}
					/>
					<label class="flex min-w-0 flex-1 items-center gap-3">
						<input
							type="checkbox"
							name="detail_on"
							value={detail.key}
							bind:checked={detail.on}
							class={CHECK}
						/>
						<span class="text-sm font-medium {detail.on ? '' : 'text-ink-muted'}"
							>{detail.label}</span
						>
					</label>
					<MoveButtons
						index={i}
						count={details.length}
						label={detail.label}
						onmove={move}
						name="detail_op"
					/>
				</div>
			{/each}
		</div>
	</fieldset>
</div>
