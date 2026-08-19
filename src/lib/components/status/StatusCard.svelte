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
			return { text: locale.status.neverLogged, classes: 'bg-surface-hover text-ink-soft' };
		}
		const due = new Date(row.due_at);
		const remaining = due.getTime() - now.getTime();
		if (remaining < 0) {
			return {
				text: locale.status.overdue(format.swedishDuration(remaining)),
				classes: 'bg-danger-badge text-danger-ink'
			};
		}
		return {
			text: locale.status.due(format.swedishRelative(due, now)),
			classes:
				remaining <= AMBER_WINDOW_MS
					? 'bg-warn-badge text-warn-ink'
					: 'bg-success-badge text-success-ink'
		};
	});

	/** The line under the label, from whichever of last-done and interval is known. */
	const detail = $derived.by(() => {
		const last = row.last_at ? format.swedishRelative(new Date(row.last_at), now) : null;
		const interval =
			row.interval_days === null ? null : locale.status.everyNthDay(row.interval_days);

		if (last && interval) {
			return locale.status.lastAndInterval(last, interval);
		}
		return interval ?? last ?? '';
	});
</script>

<article class="flex items-center gap-3 rounded-2xl border border-edge bg-surface-raised p-4">
	<span
		class="text-3xl"
		aria-hidden="true">{row.icon}</span
	>
	<div class="min-w-0 flex-1">
		<h2 class="font-semibold">{row.label}</h2>
		<p class="text-sm text-ink-muted">{detail}</p>
	</div>
	<span class="shrink-0 rounded-full px-3 py-1 text-sm font-semibold {badge.classes}">
		{badge.text}
	</span>
</article>
