<script lang="ts">
	import { svDuration, svRelative } from '$lib/format';
	import type { StatusRow } from '$lib/types/domain';

	let { row, now }: { row: StatusRow; now: Date } = $props();

	/** Amber for the last week before something is due. */
	const AMBER_WINDOW_MS = 7 * 86_400_000;

	type Badge = { text: string; classes: string };

	const badge = $derived.by((): Badge => {
		if (!row.due_at) {
			return { text: 'Aldrig loggat', classes: 'bg-gray-100 text-gray-600' };
		}
		const due = new Date(row.due_at);
		const remaining = due.getTime() - now.getTime();
		if (remaining < 0) {
			return { text: `${svDuration(remaining)} försenat`, classes: 'bg-red-100 text-red-800' };
		}
		return {
			text: `dags ${svRelative(due, now)}`,
			classes:
				remaining <= AMBER_WINDOW_MS ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'
		};
	});
</script>

<article class="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-4">
	<span class="text-3xl" aria-hidden="true">{row.icon}</span>
	<div class="min-w-0 flex-1">
		<h2 class="font-semibold">{row.label}</h2>
		<p class="text-sm text-gray-500">
			{#if row.last_at}
				{svRelative(new Date(row.last_at), now)} · var {row.interval_days}:e dag
			{:else}
				var {row.interval_days}:e dag
			{/if}
		</p>
	</div>
	<span class="shrink-0 rounded-full px-3 py-1 text-sm font-semibold {badge.classes}">
		{badge.text}
	</span>
</article>
