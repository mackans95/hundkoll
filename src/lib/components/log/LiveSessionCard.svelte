<script lang="ts">
	import Card from '$lib/components/Card.svelte';
	import { createClock } from '$lib/clock';
	import { fieldsFor, type LiveKind } from '$lib/events/fields';
	import * as format from '$lib/format';
	import * as locale from '$lib/locale';
	import * as time from '$lib/time';
	import {
		activeSession,
		adjustStart,
		discardSession,
		finishSession,
		stopSession,
		updateCount,
		setPlan,
		updateNote
	} from '$lib/offline/activeSession.svelte';
	import {
		durationMinutes,
		elapsedMinutes,
		LONG_SESSION_MINUTES,
		PLAN_CHOICES,
		suggestedPlan
	} from '$lib/offline/liveSession';
	import type { EventType } from '$lib/types/domain';
	import CountStepper from './CountStepper.svelte';
	import NoteField from './NoteField.svelte';

	let {
		type,
		kind,
		reference = null,
		onBackdate,
		onAnswer
	}: {
		type: EventType;
		kind: LiveKind;
		/** Where her limit is, for a timing session: shown under the timer. */
		reference?: { longestCalm: number | null; anxiousAfter: number | null } | null;
		/** Opens the old dialog instead; the card discards the session first. */
		onBackdate: (type: EventType) => void;
		/** A stopped timing session's answer: the page opens the type's dialog. */
		onAnswer: () => void;
	} = $props();

	const session = $derived(activeSession.current);
	const stopped = $derived(Boolean(session?.endedAt));
	// The counters a counting session shows: the type's own count fields.
	const counters = $derived(fieldsFor(type.id).filter((field) => field.input === 'count'));

	// Cosmetic tick only: elapsed is always derived from clocks, so a killed
	// app comes back with the right number without anything having run. The
	// clock stops itself when this card leaves the screen.
	const clock = createClock(1000);

	let adjusting = $state(false);
	/** Set when a long walk needs its duration confirmed before saving. */
	let confirmMinutes = $state<number | null>(null);

	function finish() {
		if (!session) {
			return;
		}
		const minutes = durationMinutes(session, new Date());
		if (minutes > LONG_SESSION_MINUTES && confirmMinutes === null) {
			// Nine hours "walking" is a forgotten finish, not a duration —
			// show the number instead of saving it blind.
			confirmMinutes = minutes;
			return;
		}
		void finishSession(type, confirmMinutes ?? undefined);
	}

	/** Hemma: the clock stops here, and the dialog asks how it went. */
	function home() {
		stopSession();
		onAnswer();
	}

	function backdate() {
		// Read the prop before discarding: `type` is a live getter into the
		// page's derived lookup of the running session, so once it is gone it
		// evaluates to null and the dialog would open on nothing.
		const backdated = type;
		discardSession();
		onBackdate(backdated);
	}

	/** Reads the adjusted start as Stockholm wall-clock; junk is ignored. */
	function startChanged(value: string) {
		const instant = time.stockholmInputToUtc(value);
		if (instant) {
			adjustStart(instant);
		}
	}

	const suggestion = $derived(reference ? suggestedPlan(reference) : null);

	function choosePlan(minutes: number) {
		setPlan(session?.plannedMin === minutes ? null : minutes);
	}

	const referenceText = $derived.by(() => {
		if (!reference) return null;
		const parts = [
			reference.longestCalm !== null
				? locale.log.liveWalk.longestCalm(format.minutesText(reference.longestCalm))
				: null,
			reference.anxiousAfter !== null
				? locale.log.liveWalk.anxiousAfter(
						locale.units.approximately(format.minutesText(reference.anxiousAfter))
					)
				: null
		].filter(Boolean);
		return parts.length > 0 ? parts.join(' · ') : null;
	});
</script>

{#snippet chip(minutes: number, label: string, suggested: boolean)}
	<button
		type="button"
		aria-pressed={session?.plannedMin === minutes}
		onclick={() => choosePlan(minutes)}
		class="min-h-9 rounded-full border px-3 text-sm font-medium {session?.plannedMin === minutes
			? 'border-emerald-600 bg-emerald-600 text-white'
			: suggested
				? 'border-emerald-600 text-ink'
				: 'border-edge-strong text-ink-muted'}"
	>
		{label}
	</button>
{/snippet}

{#if session}
	<Card>
		<h2 class="font-bold">
			<span aria-hidden="true">{type.icon}</span>
			{#if stopped}
				{locale.log.liveWalk.stopped(
					type.label,
					locale.units.minutes(String(durationMinutes(session, clock.now)))
				)}
			{:else if session.plannedMin}
				{locale.log.liveWalk.statusPlanned(
					type.label,
					elapsedMinutes(session, clock.now),
					locale.units.minutes(String(session.plannedMin))
				)}
			{:else}
				{locale.log.liveWalk.status(
					type.label,
					locale.units.minutes(String(elapsedMinutes(session, clock.now)))
				)}
			{/if}
		</h2>

		{#if kind === 'timing' && referenceText}
			<p class="text-sm text-ink-muted">{referenceText}</p>
		{/if}

		{#if kind === 'timing' && !stopped}
			<!-- Plan 24. Tapping the chosen one again clears it: no plan counts up as before. -->
			<div class="flex flex-col gap-1.5">
				<span class="text-sm font-medium text-ink-label">{locale.log.liveWalk.plan}</span>
				<div class="flex flex-wrap gap-1.5">
					{#if suggestion !== null}
						{@render chip(suggestion, locale.log.liveWalk.suggestion(suggestion), true)}
					{/if}
					{#each PLAN_CHOICES.filter((minutes) => minutes !== suggestion) as minutes (minutes)}
						{@render chip(minutes, String(minutes), false)}
					{/each}
				</div>
			</div>
		{/if}

		{#if kind === 'counting'}
			{#each counters as counter (counter.name)}
				<CountStepper
					name={counter.name}
					label={counter.label}
					bind:value={
						() => session.counts[counter.name] ?? 0, (count) => updateCount(counter.name, count)
					}
				/>
			{/each}
		{/if}
		<NoteField bind:value={() => session.note, (text) => updateNote(text)} />

		{#if adjusting && !stopped}
			<label class="flex flex-col gap-1">
				<span class="text-sm font-medium text-ink-label">{locale.log.liveWalk.adjustStart}</span>
				<input
					type="datetime-local"
					value={time.stockholmForInput(new Date(session.startedAt))}
					max={time.stockholmNowForInput()}
					onchange={(event) => startChanged(event.currentTarget.value)}
					class="rounded-lg border-edge-strong"
				/>
			</label>
		{/if}

		{#if confirmMinutes !== null}
			<label class="flex flex-col gap-1">
				<span class="text-sm font-medium text-warn-ink">{locale.log.liveWalk.checkDuration}</span>
				<input
					type="number"
					min="1"
					step="1"
					inputmode="numeric"
					bind:value={confirmMinutes}
					class="rounded-lg border-edge-strong"
				/>
			</label>
		{/if}

		<div class="mt-1 flex gap-2">
			<button
				type="button"
				onclick={discardSession}
				class="flex-1 btn btn-secondary"
			>
				{locale.log.dialog.cancel}
			</button>
			{#if kind === 'counting'}
				<button
					type="button"
					onclick={finish}
					class="flex-1 btn btn-primary"
				>
					{locale.log.liveWalk.finish}
				</button>
			{:else if stopped}
				<button
					type="button"
					onclick={onAnswer}
					class="flex-1 btn btn-primary"
				>
					{locale.log.liveWalk.answer}
				</button>
			{:else}
				<button
					type="button"
					onclick={home}
					class="flex-1 btn btn-primary"
				>
					{locale.log.liveWalk.home}
				</button>
			{/if}
		</div>

		{#if !stopped}
			<div class="flex items-center justify-between">
				<button
					type="button"
					onclick={() => (adjusting = !adjusting)}
					class="min-h-11 text-sm text-ink-muted underline"
				>
					{locale.log.liveWalk.adjustStart}
				</button>
				<button
					type="button"
					onclick={backdate}
					class="min-h-11 text-sm text-ink-muted underline"
				>
					{locale.log.liveWalk.backdateInstead}
				</button>
			</div>
		{/if}
	</Card>
{/if}
