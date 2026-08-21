<script lang="ts">
	import { detailSummary } from '$lib/events/summary';
	import * as format from '$lib/format';
	import * as locale from '$lib/locale';
	import { dismiss, offlineQueue } from '$lib/offline/queue.svelte';
	import type { EventRow } from '$lib/types/domain';

	let {
		events,
		onOpen,
		showQueued = true,
		empty = locale.log.empty
	}: {
		events: EventRow[];
		/** Off where rows come from a query rather than from today's logging. */
		showQueued?: boolean;
		/** What to say when there is nothing to list. */
		empty?: string;
		/**
		 * Opens the edit sheet for a stored row. `origin` is the row that was
		 * tapped, so the sheet can grow out of it. Queued rows have no server
		 * row yet, so they are deliberately not tappable.
		 */
		onOpen: (event: EventRow, origin: DOMRect) => void;
	} = $props();

	// A stored row takes precedence over its queued copy, which can overlap
	// for the moment between a send landing and the reload that follows.
	const stored = $derived(new Set(events.map((event) => event.id)));
	const queued = $derived(
		showQueued ? offlineQueue.items.filter((item) => !stored.has(item.id)) : []
	);

	/** The detail line, whether the row came from the queue or the database. */
	function summarise(typeId: string, details: Record<string, unknown>, note: string | null) {
		return [detailSummary(typeId, details), note]
			.filter(Boolean)
			.join(locale.activities.summary.separator);
	}
</script>

{#if events.length === 0 && queued.length === 0}
	<p class="text-ink-muted">{empty}</p>
{:else}
	<ul class="divide-y divide-edge">
		<!-- Queued rows sit on top: the list shows what has been logged, not
		     only what has been stored. -->
		{#each queued as item (item.id)}
			{@const extra = summarise(item.typeId, item.details, item.note)}
			<li
				class="flex items-baseline justify-between gap-3 py-2 {item.status === 'waiting' ||
				item.status === 'failed'
					? 'opacity-60'
					: ''}"
			>
				<span class="min-w-0">
					<span class="font-medium">{item.icon} {item.label}</span>
					{#if item.status === 'failed'}
						<span class="block truncate text-sm text-danger-accent">
							{locale.log.failedRow(item.error || locale.log.sendFailed)}
						</span>
					{:else if item.status === 'waiting'}
						<span class="block truncate text-sm text-ink-muted">{locale.log.waitingRow}</span>
					{:else if extra}
						<span class="block truncate text-sm text-ink-muted">{extra}</span>
					{/if}
				</span>
				{#if item.status === 'failed'}
					<button
						type="button"
						onclick={() => dismiss(item.id)}
						class="shrink-0 text-sm font-medium text-danger-accent underline decoration-dotted"
					>
						{locale.log.dismissFailed}
					</button>
				{:else}
					<time
						datetime={item.occurredAt}
						class="shrink-0 text-sm text-ink-muted"
					>
						{format.eventTime(new Date(item.occurredAt))}
					</time>
				{/if}
			</li>
		{/each}

		{#each events as event (event.id)}
			{@const extra = summarise(event.type_id, event.details, event.note)}
			<li>
				<!-- A link, so ?event= opens the sheet server-side before
				     hydration and the row can be sent to the other phone. -->
				<a
					href="?event={event.id}"
					onclick={(clicked) => {
						clicked.preventDefault();
						onOpen(event, clicked.currentTarget.getBoundingClientRect());
					}}
					class="-mx-2 flex items-baseline justify-between gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-surface-hover-soft active:bg-surface-hover"
				>
					<span class="min-w-0">
						<span class="font-medium">{event.type?.icon} {event.type?.label ?? event.type_id}</span>
						{#if extra}
							<span class="block truncate text-sm text-ink-muted">{extra}</span>
						{/if}
					</span>
					<time
						datetime={event.occurred_at}
						class="shrink-0 text-sm text-ink-muted"
					>
						{format.eventTime(new Date(event.occurred_at))}
					</time>
				</a>
			</li>
		{/each}
	</ul>
{/if}
