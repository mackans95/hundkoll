<script lang="ts">
	import { chartColor, type PaletteEntry, type PaletteKey } from '$lib/stats/palette';

	let {
		palette,
		current,
		label
	}: { palette: PaletteEntry[]; current: PaletteKey | null; label: string } = $props();
</script>

<!-- Radios, so it posts without JS. The pick is marked by a ring and weight,
     never by hue alone. -->
<fieldset class="grid grid-cols-3 gap-2">
	<legend class="sr-only">{label}</legend>
	{#each palette as entry (entry.key)}
		<label
			class="flex cursor-pointer flex-col items-center gap-1 rounded-2xl border border-edge bg-surface-raised px-2 py-3 text-sm text-ink-muted has-checked:border-ink has-checked:font-semibold has-checked:text-ink has-checked:ring-2 has-checked:ring-ink has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-emerald-600"
		>
			<input
				type="radio"
				name="chart_color"
				value={entry.key}
				checked={entry.key === current}
				class="sr-only"
			/>
			<span
				class="flex gap-1"
				aria-hidden="true"
			>
				<span
					class="h-6 w-4 rounded-sm"
					style:background={chartColor(entry.key).main}
				></span>
				<span
					class="h-6 w-4 rounded-sm"
					style:background={chartColor(entry.key).alt}
				></span>
			</span>
			{entry.label}
		</label>
	{/each}
</fieldset>
