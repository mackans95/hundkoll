<script lang="ts">
	import * as locale from '$lib/locale';

	let {
		name,
		label,
		value = $bindable(0)
	}: { name: string; label: string; value?: number } = $props();

	/** Steps the count, never below zero — zero simply means "none". */
	function step(delta: number) {
		value = Math.max(0, (Number.isFinite(value) ? value : 0) + delta);
	}
</script>

<!-- Always visible, default 0, one full row: the − / + halves are the thumb
     targets. The amount is a real number input so the form posts <name>=N
     with or without JavaScript — no checkbox to degrade through. -->
<div class="flex min-h-11 items-center gap-3">
	<span class="w-14 shrink-0 text-sm font-medium text-ink-label">{label}</span>
	<div class="flex flex-1 items-center gap-2">
		<button
			type="button"
			aria-label={locale.log.dialog.fewer(label)}
			onclick={() => step(-1)}
			class="h-11 flex-1 rounded-lg border border-edge-strong text-lg leading-none transition-colors hover:bg-surface-hover active:bg-surface-hover"
		>
			−
		</button>
		<input
			type="number"
			{name}
			inputmode="numeric"
			min="0"
			step="1"
			aria-label={label}
			bind:value
			class="w-14 rounded-lg border-edge-strong text-center font-semibold"
		/>
		<button
			type="button"
			aria-label={locale.log.dialog.more(label)}
			onclick={() => step(1)}
			class="h-11 flex-1 rounded-lg border border-edge-strong text-lg leading-none transition-colors hover:bg-surface-hover active:bg-surface-hover"
		>
			+
		</button>
	</div>
</div>
