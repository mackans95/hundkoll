<script lang="ts">
	import { detailSummary } from '$lib/events/summary';
	import * as format from '$lib/format';
	import * as locale from '$lib/locale';
	import { dismiss, offlineQueue } from '$lib/offline/queue.svelte';
	import type { EventRow } from '$lib/types/domain';

	let { events }: { events: EventRow[] } = $props();

	// A row that has been stored takes precedence over the copy still sitting in
	// the queue, which can overlap for the moment between a send landing and the
	// reload that follows it.
	const stored = $derived(new Set(events.map((event) => event.id)));
	const queued = $derived(offlineQueue.items.filter((item) => !stored.has(item.id)));

	/** The detail line, whether the row came from the queue or the database. */
	function summarise(typeId: string, details: Record<string, unknown>, note: string | null) {
		return [detailSummary(typeId, details), note]
			.filter(Boolean)
			.join(locale.activities.summary.separator);
	}
</script>

{#if events.length === 0 && queued.length === 0}
	<p class="text-gray-500">{locale.log.empty}</p>
{:else}
	<ul class="divide-y divide-gray-200">
		<!-- Queued rows sit on top, so the list shows what has been logged rather
		     than only what has been stored. One still in flight looks like any
		     other row; only a row that could not be sent says so. -->
		{#each queued as item (item.id)}
			{@const extra = summarise(item.typeId, item.details, item.note)}
			<li
				class="flex items-baseline justify-between gap-3 py-2 {item.waiting || item.error
					? 'opacity-60'
					: ''}"
			>
				<span class="min-w-0">
					<span class="font-medium">{item.icon} {item.label}</span>
					{#if item.error !== null}
						<span class="block truncate text-sm text-red-700">
							{locale.log.failedRow(item.error || locale.log.sendFailed)}
						</span>
					{:else if item.waiting}
						<span class="block truncate text-sm text-gray-500">{locale.log.waitingRow}</span>
					{:else if extra}
						<span class="block truncate text-sm text-gray-500">{extra}</span>
					{/if}
				</span>
				{#if item.error !== null}
					<button
						type="button"
						onclick={() => dismiss(item.id)}
						class="shrink-0 text-sm font-medium text-red-700 underline decoration-dotted"
					>
						{locale.log.dismissFailed}
					</button>
				{:else}
					<time
						datetime={item.occurredAt}
						class="shrink-0 text-sm text-gray-500"
					>
						{format.eventTime(new Date(item.occurredAt))}
					</time>
				{/if}
			</li>
		{/each}

		{#each events as event (event.id)}
			{@const extra = summarise(event.type_id, event.details, event.note)}
			<li class="flex items-baseline justify-between gap-3 py-2">
				<span class="min-w-0">
					<span class="font-medium">{event.type?.icon} {event.type?.label ?? event.type_id}</span>
					{#if extra}
						<span class="block truncate text-sm text-gray-500">{extra}</span>
					{/if}
				</span>
				<time
					datetime={event.occurred_at}
					class="shrink-0 text-sm text-gray-500"
				>
					{format.eventTime(new Date(event.occurred_at))}
				</time>
			</li>
		{/each}
	</ul>
{/if}
