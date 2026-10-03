<script lang="ts">
	import Card from '$lib/components/Card.svelte';
	import LiveSessionCard from '$lib/components/log/LiveSessionCard.svelte';
	import AwayCard from '$lib/components/log/AwayCard.svelte';
	import EventList from '$lib/components/log/EventList.svelte';
	import EventSheet from '$lib/components/log/EventSheet.svelte';
	import LogDialog from '$lib/components/log/LogDialog.svelte';
	import LogGrid from '$lib/components/log/LogGrid.svelte';
	import { replaceState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { isAbsence } from '$lib/events/absence';
	import { LIVE_TYPES } from '$lib/events/fields';
	import * as locale from '$lib/locale';
	import { mirrorSession } from '$lib/native';
	import {
		activeSession,
		discardSession,
		handleHome,
		loadActiveSession,
		lockScreen,
		startSession
	} from '$lib/offline/activeSession.svelte';
	import { durationMinutes } from '$lib/offline/liveSession';
	import { offlineQueue } from '$lib/offline/queue.svelte';
	import * as time from '$lib/time';
	import type { EventRow, EventType } from '$lib/types/domain';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	onMount(() => {
		// A walk or an Ensamtid may still be running from before the app was killed.
		loadActiveSession();
		// A live type's ?detail= means the tap beat hydration, or the installed
		// app reopened the URL it was closed at; do what the tap meant. After
		// loadActiveSession, so a session that survived the kill wins over the URL.
		if (data.detailType && data.detailType.id in LIVE_TYPES) {
			startSession(data.detailType.id);
			urlDialogClosed = true;
			// A task later: the router finishes starting after mount, and
			// replaceState throws until then. Left in place, ?detail= would
			// start a fresh walk on the next open.
			setTimeout(() => replaceState(resolve('/'), {}), 0);
		}
	});

	/** Everything the dialog needs, whoever opened it. */
	type OpenDialog = {
		type: EventType;
		eventId: string;
		nowLocal: string;
		/** Null when ?detail= opened it, since then no tile was tapped. */
		origin: DOMRect | null;
		/** A live Ensamtid's answer (plan 23): its start, its length, its note. */
		live?: { occurredLocal: string; values: Record<string, number>; note: string };
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

	/**
	 * One tap starts the walk; a second tap points back at the card. The
	 * absence tile only ever points back — an absence is started through the
	 * dialog, and its card is on the page only while one is open.
	 */
	function startLive(type: EventType) {
		if (isAbsence(type.category)) {
			document.getElementById('away')?.scrollIntoView({ behavior: 'smooth' });
			return;
		}
		if (activeSession.current) {
			document.getElementById('live-session')?.scrollIntoView({ behavior: 'smooth' });
			return;
		}
		startSession(type.id);
	}

	// The running session's catalogue row, for the card's label and icon. Gone
	// from the catalogue (never, in practice) would simply hide the card.
	const liveType = $derived(
		activeSession.current
			? (data.types.find((type) => type.id === activeSession.current?.typeId) ?? null)
			: null
	);

	/**
	 * A stopped Ensamtid's answer: the type's own dialog, with Tidpunkt at the
	 * start, Längd the minutes away and the note carried over. The session's id
	 * is the row id, so a double tap or a replay stores it once.
	 */
	function answer() {
		const session = activeSession.current;
		if (!session || !liveType) return;
		opened = {
			type: liveType,
			eventId: session.id,
			nowLocal: time.stockholmNowForInput(),
			origin: null,
			live: {
				occurredLocal: time.stockholmForInput(new Date(session.startedAt)),
				values: { duration_min: durationMinutes(session, new Date()) },
				note: session.note
			}
		};
	}

	// Hemma pressed on the lock screen asks here, once the page knows of it.
	onMount(() => handleHome(answer));

	// Every change to the walk reaches the lock screen (plan 20), once it has
	// been lined up with what was tapped there. The note is the only thing
	// typed, so a pause lets a sentence through as one update.
	let mirrorTimer: ReturnType<typeof setTimeout> | undefined;
	$effect(() => {
		const session = activeSession.current;
		const type = liveType;
		if (!lockScreen.synced) return;
		clearTimeout(mirrorTimer);
		mirrorTimer = setTimeout(() => void mirrorSession(session, type), 300);
	});

	// The tiles whose activity already has a card on the page.
	const busyTypeIds = $derived(
		[liveType?.id, data.away?.type_id].filter((id): id is string => Boolean(id))
	);

	function close() {
		if (opened) {
			opened = null;
			return;
		}
		urlDialogClosed = true;
		// Tidy ?detail= away so a reload does not reopen the dialog;
		// replaceState because there is no new data to fetch.
		replaceState(resolve('/'), {});
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
		replaceState(resolve('/'), {});
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

	<!-- Not while the dialog or the away card is up: each shows the message
	     itself, next to the form it came from. -->
	{#if form?.message && !data.detailType && !data.away}
		<p class="rounded-lg bg-danger-surface p-4 text-danger-ink">{form.message}</p>
	{/if}

	{#if waiting > 0}
		<p class="rounded-lg bg-warn-surface p-3 text-sm text-warn-ink">
			{locale.log.waitingBanner(waiting)}
		</p>
	{/if}

	{#if data.away}
		<div id="away">
			<AwayCard
				event={data.away}
				now={data.now}
				message={form?.message ?? null}
			/>
		</div>
	{/if}

	{#if liveType}
		<div id="live-session">
			<LiveSessionCard
				type={liveType}
				kind={LIVE_TYPES[liveType.id] ?? 'counting'}
				reference={liveType.id === 'alone' ? data.aloneReference : null}
				onBackdate={(type) => open(type, null)}
				onAnswer={answer}
			/>
		</div>
	{/if}

	<Card padding="p-3">
		<LogGrid
			types={data.types}
			onOpen={open}
			onStartLive={startLive}
			{busyTypeIds}
			failed={data.typesFailed}
		/>
	</Card>

	<Card title={locale.log.recentHeading}>
		<!-- A link rather than a fifth tab: the tab bar is for daily screens,
		     and history is an occasional lookup and repair tool. -->
		{#snippet action()}
			<a
				href={resolve('/history')}
				class="text-sm text-ink-muted underline">{locale.history.showAll}</a
			>
		{/snippet}

		<EventList
			events={data.events}
			onOpen={openEvent}
			empty={data.eventsFailed ? locale.log.loadFailed : locale.log.empty}
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
			occurredLocal={dialog.live?.occurredLocal}
			values={dialog.live?.values}
			note={dialog.live?.note}
			onSaved={dialog.live
				? () => {
						discardSession();
						close();
					}
				: close}
		/>
	{/key}
{/if}
