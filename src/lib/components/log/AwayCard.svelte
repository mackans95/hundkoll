<script lang="ts">
	import { enhance } from '$app/forms';
	import Card from '$lib/components/Card.svelte';
	import * as format from '$lib/format';
	import * as locale from '$lib/locale';
	import type { EventRow } from '$lib/types/domain';

	let {
		event,
		now,
		message
	}: {
		/** The open absence: a stored row, unlike the live walk, so both phones see it. */
		event: EventRow;
		/** The page's render moment, so server and client agree on the elapsed time. */
		now: Date;
		message: string | null;
	} = $props();

	const label = $derived(event.type?.label ?? event.type_id);
	const started = $derived(new Date(event.occurred_at));
</script>

<!-- Where the live-walk card sits, and shaped like it. Hemma igen is an
     update, so it posts to the server like an edit rather than through the
     queue: coming home means being home, where there is signal. -->
<Card>
	<h2 class="font-bold">
		<span aria-hidden="true">{event.type?.icon}</span>
		{locale.log.liveWalk.status(label, format.swedishDuration(now.getTime() - started.getTime()))}
	</h2>
	<p class="text-sm text-ink-muted">{locale.log.away.since(format.eventTime(started))}</p>

	{#if message}
		<p class="rounded-lg bg-danger-surface p-3 text-danger-ink">{message}</p>
	{/if}

	<form
		method="POST"
		action="?/return"
		use:enhance
	>
		<input
			type="hidden"
			name="event_id"
			value={event.id}
		/>
		<button
			type="submit"
			class="w-full btn btn-primary">{locale.log.away.returnHome}</button
		>
	</form>
</Card>
