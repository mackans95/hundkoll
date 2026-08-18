<script lang="ts">
	import Card from '$lib/components/Card.svelte';
	import EventList from '$lib/components/log/EventList.svelte';
	import LogDialog from '$lib/components/log/LogDialog.svelte';
	import LogGrid from '$lib/components/log/LogGrid.svelte';
	import { replaceState } from '$app/navigation';
	import * as locale from '$lib/locale';
	import { offlineQueue } from '$lib/offline/queue.svelte';
	import * as time from '$lib/time';
	import type { EventType } from '$lib/types/domain';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	/** Everything the dialog needs, whoever opened it. */
	type OpenDialog = { type: EventType; eventId: string; nowLocal: string };

	// Set whenever the page opened the dialog itself, which is every tap once
	// the page has hydrated. `data.detailType` only comes into it when the tap
	// happened first — before hydration, or with JavaScript off.
	let opened = $state<OpenDialog | null>(null);
	// A dialog that came from ?detail= is closed by ignoring it, not by asking
	// the server for the page again.
	let urlDialogClosed = $state(false);

	/** Opens a dialog from data already on the page, with a fresh row id. */
	function open(type: EventType) {
		opened = { type, eventId: crypto.randomUUID(), nowLocal: time.stockholmNowForInput() };
	}

	function close() {
		if (opened) {
			opened = null;
			return;
		}
		urlDialogClosed = true;
		// Tidy ?detail= out of the URL so a reload does not reopen the dialog.
		// replaceState rather than a navigation: there is no new data to fetch.
		replaceState('/', {});
	}

	const dialog = $derived<OpenDialog | null>(
		opened ??
			(data.detailType && !urlDialogClosed
				? { type: data.detailType, eventId: data.eventId, nowLocal: data.nowLocal }
				: null)
	);

	// Only the rows that could not be sent; one still in flight is not something
	// to warn about.
	const waiting = $derived(offlineQueue.items.filter((item) => item.waiting).length);
</script>

<svelte:head><title>{locale.app.name}</title></svelte:head>

<main class="mx-auto flex min-h-dvh max-w-sm flex-col gap-4 p-4 pb-10">
	<header class="px-1">
		<h1 class="text-3xl font-bold">{data.dog?.name ?? locale.app.name}</h1>
		<p class="mt-1 text-sm text-gray-500">{locale.log.subtitle}</p>
	</header>

	{#if form?.message && !data.detailType}
		<p class="rounded-lg bg-red-50 p-4 text-red-800">{form.message}</p>
	{/if}

	{#if waiting > 0}
		<p class="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
			{locale.log.waitingBanner(waiting)}
		</p>
	{/if}

	<Card padding="p-3">
		<LogGrid types={data.types} onOpen={open} />
	</Card>

	<Card title={locale.log.recentHeading}>
		<EventList events={data.events} />
	</Card>
</main>

{#if dialog}
	<!-- Keyed so the detail fields and their stepper state start fresh
	     whenever a different activity is opened. -->
	{#key dialog.type.id}
		<LogDialog
			type={dialog.type}
			nowLocal={dialog.nowLocal}
			eventId={dialog.eventId}
			message={form?.message ?? null}
			onClose={close}
		/>
	{/key}
{/if}
