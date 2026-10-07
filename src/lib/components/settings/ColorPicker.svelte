<script lang="ts">
	import { chartColor, type PaletteEntry, type PaletteKey } from '$lib/stats/palette';

	let {
		palette,
		current,
		label,
		name
	}: { palette: PaletteEntry[]; current: PaletteKey | null; label: string; name: string } =
		$props();
</script>

<!-- Radios, so it posts without JS. The pick is marked by a ring, never by hue
     alone, and not by weight: "Bärnsten" in bold overflows its column. Six
     columns always, so a type without Skiffer lines up with the rows around it. -->
<fieldset class="grid grid-cols-6 gap-0.5">
	<legend class="sr-only">{label}</legend>
	{#each palette as entry (entry.key)}
		<label
			class="flex cursor-pointer flex-col items-center gap-1 rounded-xl border border-transparent py-1.5 text-xs text-ink-muted has-checked:border-ink has-checked:text-ink has-checked:ring-1 has-checked:ring-ink has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-emerald-600"
		>
			<input
				type="radio"
				{name}
				value={entry.key}
				checked={entry.key === current}
				class="sr-only"
			/>
			<span
				class="flex gap-0.5"
				aria-hidden="true"
			>
				<span
					class="h-5 w-3 rounded-sm"
					style:background={chartColor(entry.key).main}
				></span>
				<span
					class="h-5 w-3 rounded-sm"
					style:background={chartColor(entry.key).alt}
				></span>
			</span>
			{entry.label}
		</label>
	{/each}
</fieldset>
