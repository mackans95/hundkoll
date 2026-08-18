<script
	lang="ts"
	module
>
	export type LegendItem = { color: string; label: string };
</script>

<script lang="ts">
	let { items }: { items: LegendItem[] } = $props();
</script>

<div class="flex gap-4 text-sm text-gray-600">
	{#each items as item (item.label)}
		<span class="flex items-center gap-1.5">
			<span
				class="h-2.5 w-2.5 rounded-full"
				style="background:{item.color}"
			></span>
			{item.label}
		</span>
	{/each}
</div>
