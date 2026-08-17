<script lang="ts">
	import { detailSummary } from '$lib/events/summary';
	import * as format from '$lib/format';
	import { offlineQueue } from '$lib/offline/queue.svelte';
	import type { EventRow } from '$lib/types/domain';

	let { events }: { events: EventRow[] } = $props();
</script>

{#if events.length === 0 && offlineQueue.items.length === 0}
	<p class="text-gray-500">Inget loggat ännu.</p>
{:else}
	<ul class="divide-y divide-gray-200">
		<!-- Anything still waiting for signal sits on top, dimmed, so the list
		     reflects what has been logged rather than what has been stored. -->
		{#each offlineQueue.items as queued (queued.id)}
			<li class="flex items-baseline justify-between gap-3 py-2 opacity-60">
				<span class="min-w-0">
					<span class="font-medium">{queued.icon} {queued.label}</span>
					<span class="block truncate text-sm text-gray-500">⏳ väntar på signal</span>
				</span>
				<time datetime={queued.occurredAt} class="shrink-0 text-sm text-gray-500">
					{format.eventTime(new Date(queued.occurredAt))}
				</time>
			</li>
		{/each}

		{#each events as event (event.id)}
			{@const extra = [detailSummary(event.type_id, event.details), event.note]
				.filter(Boolean)
				.join(' · ')}
			<li class="flex items-baseline justify-between gap-3 py-2">
				<span class="min-w-0">
					<span class="font-medium">{event.type?.icon} {event.type?.label ?? event.type_id}</span>
					{#if extra}
						<span class="block truncate text-sm text-gray-500">{extra}</span>
					{/if}
				</span>
				<time datetime={event.occurred_at} class="shrink-0 text-sm text-gray-500">
					{format.eventTime(new Date(event.occurred_at))}
				</time>
			</li>
		{/each}
	</ul>
{/if}
