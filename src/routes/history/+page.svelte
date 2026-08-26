<script lang="ts">
	import { page } from '$app/state';
	import { replaceState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Card from '$lib/components/Card.svelte';
	import MonthCalendar from '$lib/components/history/MonthCalendar.svelte';
	import EventList from '$lib/components/log/EventList.svelte';
	import EventSheet from '$lib/components/log/EventSheet.svelte';
	import * as format from '$lib/format';
	import * as locale from '$lib/locale';
	import type { EventRow } from '$lib/types/domain';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// The sheet, on the same pattern as the log page: a tap holds the row, and
	// ?event= covers the pre-hydration and no-JavaScript path.
	let openedEvent = $state<{ event: EventRow; origin: DOMRect | null } | null>(null);
	let urlSheetClosed = $state(false);

	const sheet = $derived<{ event: EventRow; origin: DOMRect | null } | null>(
		openedEvent ??
			(data.editEvent && !urlSheetClosed ? { event: data.editEvent, origin: null } : null)
	);

	function closeEvent() {
		if (openedEvent) {
			openedEvent = null;
			return;
		}
		urlSheetClosed = true;
		// Keeps the month and day on screen; only the sheet leaves the URL.
		const next = new URL(page.url);
		next.searchParams.delete('event');
		replaceState(next, {});
	}

	// Selecting a day keeps the month, and vice versa — one parameter each.
	// Relative rather than resolve()'d: both stay on this page, and the path
	// is whatever page that is.
	const dayHref = (day: string) => `?month=${data.month}&day=${day}`;
	const monthHref = (month: string) => `?month=${month}`;
</script>

<svelte:head><title>{locale.app.pageTitle(locale.history.title)}</title></svelte:head>

<main class="mx-auto flex min-h-dvh max-w-sm flex-col gap-4 p-4">
	<header class="flex items-baseline justify-between gap-2 px-1">
		<h1 class="text-3xl font-bold">{locale.history.title}</h1>
		<a
			href={resolve('/')}
			class="text-sm text-ink-muted underline">{locale.history.backToLog}</a
		>
	</header>

	<Card>
		<div class="flex items-center justify-between gap-2">
			<a
				href={monthHref(data.previousMonth)}
				aria-label={locale.history.previousMonth}
				data-sveltekit-noscroll
				class="flex h-11 w-11 items-center justify-center rounded-lg text-lg transition-colors hover:bg-surface-hover-soft"
				>‹</a
			>
			<h2 class="font-semibold">{format.monthHeading(data.month)}</h2>
			<a
				href={monthHref(data.nextMonth)}
				aria-label={locale.history.nextMonth}
				data-sveltekit-noscroll
				class="flex h-11 w-11 items-center justify-center rounded-lg text-lg transition-colors hover:bg-surface-hover-soft"
				>›</a
			>
		</div>

		<MonthCalendar
			days={data.days}
			summaries={data.summaries}
			selected={data.selected}
			today={data.today}
			{dayHref}
		/>
	</Card>

	{#if data.selected}
		<Card title={format.dayHeading(data.selected)}>
			<!-- Stored rows only: a queued log has no server row to edit, and
			     belongs on the log page where it was made. -->
			<EventList
				events={data.dayEvents}
				onOpen={(event, origin) => (openedEvent = { event, origin })}
				showQueued={false}
				empty={data.eventsFailed ? locale.history.loadFailed : locale.history.emptyDay}
			/>
		</Card>
	{/if}
</main>

{#if sheet}
	{#key sheet.event.id}
		<EventSheet
			event={sheet.event}
			origin={sheet.origin}
			message={form?.message ?? null}
			onClose={closeEvent}
		/>
	{/key}
{/if}
