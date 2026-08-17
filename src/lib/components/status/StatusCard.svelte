<script lang="ts">
	import * as format from '$lib/format';
	import * as locale from '$lib/locale';
	import type { StatusRow } from '$lib/types/domain';

	let { row, now }: { row: StatusRow; now: Date } = $props();

	type Badge = { text: string; classes: string };

	/**
	 * Says where this activity stands: red once it is overdue, amber in the
	 * last week before it is due, green while there is still time.
	 */
	const badge = $derived.by((): Badge => {
		const AMBER_WINDOW_MS = 7 * 86_400_000;

		if (!row.due_at) {
			return { text: locale.status.neverLogged, classes: 'bg-gray-100 text-gray-600' };
		}
		const due = new Date(row.due_at);
		const remaining = due.getTime() - now.getTime();
		if (remaining < 0) {
			return {
				text: locale.status.overdue(format.swedishDuration(remaining)),
				classes: 'bg-red-100 text-red-800'
			};
		}
		return {
			text: locale.status.due(format.swedishRelative(due, now)),
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
				{locale.status.lastAndInterval(
					format.swedishRelative(new Date(row.last_at), now),
					locale.status.everyNthDay(row.interval_days)
				)}
			{:else}
				{locale.status.everyNthDay(row.interval_days)}
			{/if}
		</p>
	</div>
	<span class="shrink-0 rounded-full px-3 py-1 text-sm font-semibold {badge.classes}">
		{badge.text}
	</span>
</article>
