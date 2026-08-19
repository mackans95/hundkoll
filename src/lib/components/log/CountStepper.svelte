<script lang="ts">
	import * as locale from '$lib/locale';

	let { name, label }: { name: string; label: string } = $props();

	// The checkbox is what submits without JavaScript, where it degrades to
	// a count of one; the stepper adds the number on top of it.
	let checked = $state(false);
	let count = $state(1);

	/** Turns the count on or off, starting over at one each time it comes back. */
	function toggle(on: boolean) {
		checked = on;
		if (!on) {
			count = 1;
		}
	}
</script>

<div class="flex min-h-11 items-center justify-between">
	<label class="flex items-center gap-2">
		<input
			type="checkbox"
			{name}
			{checked}
			onchange={(e) => toggle(e.currentTarget.checked)}
			class="rounded border-edge-strong"
		/>
		<span class="text-sm font-medium text-ink-label">{label}</span>
	</label>

	{#if checked}
		<div class="flex items-center gap-3">
			<button
				type="button"
				aria-label={locale.log.dialog.fewer(label)}
				onclick={() => (count = Math.max(1, count - 1))}
				class="h-9 w-9 rounded-full border border-edge-strong text-lg leading-none transition-colors hover:bg-surface-hover active:bg-surface-hover"
			>
				−
			</button>
			<span class="w-4 text-center font-semibold">{count}</span>
			<button
				type="button"
				aria-label={locale.log.dialog.more(label)}
				onclick={() => (count += 1)}
				class="h-9 w-9 rounded-full border border-edge-strong text-lg leading-none transition-colors hover:bg-surface-hover active:bg-surface-hover"
			>
				+
			</button>
			<input
				type="hidden"
				name="{name}_count"
				value={count}
			/>
		</div>
	{/if}
</div>
