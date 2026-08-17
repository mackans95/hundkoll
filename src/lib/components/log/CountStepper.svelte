<script lang="ts">
	let { name, label }: { name: string; label: string } = $props();

	// The checkbox is what submits without JavaScript, where it degrades to
	// a count of one; the stepper adds the number on top of it.
	let checked = $state(false);
	let count = $state(1);

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
			class="rounded border-gray-300"
		/>
		<span class="text-sm font-medium text-gray-700">{label}</span>
	</label>

	{#if checked}
		<div class="flex items-center gap-3">
			<button
				type="button"
				aria-label="Färre {label.toLowerCase()}"
				onclick={() => (count = Math.max(1, count - 1))}
				class="h-9 w-9 rounded-full border border-gray-300 text-lg leading-none transition-colors hover:bg-gray-100 active:bg-gray-100"
			>
				−
			</button>
			<span class="w-4 text-center font-semibold">{count}</span>
			<button
				type="button"
				aria-label="Fler {label.toLowerCase()}"
				onclick={() => (count += 1)}
				class="h-9 w-9 rounded-full border border-gray-300 text-lg leading-none transition-colors hover:bg-gray-100 active:bg-gray-100"
			>
				+
			</button>
			<input type="hidden" name="{name}_count" value={count} />
		</div>
	{/if}
</div>
