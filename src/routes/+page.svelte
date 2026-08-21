<script lang="ts">
	import Card from '$lib/components/Card.svelte';
	import ActiveWalkCard from '$lib/components/log/ActiveWalkCard.svelte';
	import EventList from '$lib/components/log/EventList.svelte';
	import EventSheet from '$lib/components/log/EventSheet.svelte';
	import LogDialog from '$lib/components/log/LogDialog.svelte';
	import LogGrid from '$lib/components/log/LogGrid.svelte';
	import { replaceState } from '$app/navigation';
	import { onMount } from 'svelte';
	import * as locale from '$lib/locale';
	import { activeWalk, loadActiveWalk, startWalk } from '$lib/offline/activeWalk.svelte';
	import { offlineQueue } from '$lib/offline/queue.svelte';
	import * as time from '$lib/time';
	import type { EventRow, EventType } from '$lib/types/domain';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// A walk may still be running from before the app was killed.
	onMount(loadActiveWalk);

	/** Everything the dialog needs, whoever opened it. */
	type OpenDialog = {
		type: EventType;
		eventId: string;
		nowLocal: string;
		/** Null when ?detail= opened it, since then no tile was tapped. */
		origin: DOMRect | null;
	};

	// Set when the page opened the dialog itself; `data.detailType` only comes
	// into it when the tap landed before hydration, or with JavaScript off.
	let opened = $state<OpenDialog | null>(null);
	// A dialog that came from ?detail= is closed by ignoring it, not by asking
	// the server for the page again.
	let urlDialogClosed = $state(false);

	/** Opens a dialog from data already on the page, with a fresh row id.
	 * `origin` is null when no tile rect exists (the backdate link). */
	function open(type: EventType, origin: DOMRect | null) {
		opened = { type, eventId: crypto.randomUUID(), nowLocal: time.stockholmNowForInput(), origin };
	}

	/** One tap starts the walk; a second tap points back at the card. */
	function startLive(type: EventType) {
		if (activeWalk.current) {
			document.getElementById('active-walk')?.scrollIntoView({ behavior: 'smooth' });
			return;
		}
		startWalk(type.id);
	}

	// The running walk's catalogue row, for the card's label and icon. Gone
	// from the catalogue (never, in practice) would simply hide the card.
	const liveType = $derived(
		activeWalk.current
			? (data.types.find((type) => type.id === activeWalk.current?.typeId) ?? null)
			: null
	);

	function close() {
		if (opened) {
			opened = null;
			return;
		}
		urlDialogClosed = true;
		// Tidy ?detail= away so a reload does not reopen the dialog;
		// replaceState because there is no new data to fetch.
		replaceState('/', {});
	}

	/** The stored event whose sheet is open, on the same pattern as above. */
	let openedEvent = $state<{ event: EventRow; origin: DOMRect | null } | null>(null);
	let urlSheetClosed = $state(false);

	function openEvent(event: EventRow, origin: DOMRect) {
		openedEvent = { event, origin };
	}

	function closeEvent() {
		if (openedEvent) {
			openedEvent = null;
			return;
		}
		urlSheetClosed = true;
		replaceState('/', {});
	}

	const sheet = $derived<{ event: EventRow; origin: DOMRect | null } | null>(
		openedEvent ??
			(data.editEvent && !urlSheetClosed ? { event: data.editEvent, origin: null } : null)
	);

	const dialog = $derived<OpenDialog | null>(
		opened ??
			(data.detailType && !urlDialogClosed
				? {
						type: data.detailType,
						eventId: data.eventId,
						nowLocal: data.nowLocal,
						origin: null
					}
				: null)
	);

	// Only rows that could not be sent; one still in flight is no warning.
	const waiting = $derived(offlineQueue.items.filter((item) => item.status === 'waiting').length);
</script>

<svelte:head><title>{locale.app.name}</title></svelte:head>

<main class="mx-auto flex min-h-dvh max-w-sm flex-col gap-4 p-4 pb-10">
	<header class="px-1">
		<h1 class="text-3xl font-bold">{data.dog?.name ?? locale.app.name}</h1>
		<p class="mt-1 text-sm text-ink-muted">{locale.log.subtitle}</p>
	</header>

	{#if form?.message && !data.detailType}
		<p class="rounded-lg bg-danger-surface p-4 text-danger-ink">{form.message}</p>
	{/if}

	{#if waiting > 0}
		<p class="rounded-lg bg-warn-surface p-3 text-sm text-warn-ink">
			{locale.log.waitingBanner(waiting)}
		</p>
	{/if}

	{#if liveType}
		<div id="active-walk">
			<ActiveWalkCard
				type={liveType}
				onBackdate={(type) => open(type, null)}
			/>
		</div>
	{/if}

	<Card padding="p-3">
		<LogGrid
			types={data.types}
			onOpen={open}
			onStartLive={startLive}
			liveTypeId={liveType?.id ?? null}
		/>
	</Card>

	<Card title={locale.log.recentHeading}>
		<!-- A link rather than a fifth tab: the tab bar is for daily screens,
		     and history is an occasional lookup and repair tool. -->
		{#snippet action()}
			<a
				href="/history"
				class="text-sm text-ink-muted underline">{locale.history.showAll}</a
			>
		{/snippet}

		<EventList
			events={data.events}
			onOpen={openEvent}
		/>
	</Card>
</main>

{#if sheet}
	<!-- Keyed so the sheet's edit/confirm modes reset per event. -->
	{#key sheet.event.id}
		<EventSheet
			event={sheet.event}
			origin={sheet.origin}
			message={form?.message ?? null}
			onClose={closeEvent}
		/>
	{/key}
{/if}

{#if dialog}
	<!-- Keyed so fields reset — and use:enhance rebinds — per activity. -->
	{#key dialog.type.id}
		<LogDialog
			type={dialog.type}
			nowLocal={dialog.nowLocal}
			eventId={dialog.eventId}
			origin={dialog.origin}
			message={form?.message ?? null}
			onClose={close}
		/>
	{/key}
{/if}
