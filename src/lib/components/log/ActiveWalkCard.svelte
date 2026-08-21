<script lang="ts">
	import Card from '$lib/components/Card.svelte';
	import { createClock } from '$lib/clock';
	import * as locale from '$lib/locale';
	import * as time from '$lib/time';
	import {
		activeWalk,
		adjustStart,
		discardWalk,
		finishWalk,
		updateWalk
	} from '$lib/offline/activeWalk.svelte';
	import { durationMinutes, elapsedMinutes, LONG_WALK_MINUTES } from '$lib/offline/liveWalk';
	import type { EventType } from '$lib/types/domain';
	import CountStepper from './CountStepper.svelte';
	import NoteField from './NoteField.svelte';

	let {
		type,
		onBackdate
	}: {
		type: EventType;
		/** Opens the old dialog instead; the card discards the walk first. */
		onBackdate: (type: EventType) => void;
	} = $props();

	const walk = $derived(activeWalk.current);

	// Cosmetic tick only: elapsed is always derived from clocks, so a killed
	// app comes back with the right number without anything having run. The
	// clock stops itself when this card leaves the screen.
	const clock = createClock(1000);

	let adjusting = $state(false);
	/** Set when a long walk needs its duration confirmed before saving. */
	let confirmMinutes = $state<number | null>(null);

	function finish() {
		if (!walk) {
			return;
		}
		const minutes = durationMinutes(walk, new Date());
		if (minutes > LONG_WALK_MINUTES && confirmMinutes === null) {
			// Nine hours "walking" is a forgotten finish, not a duration —
			// show the number instead of saving it blind.
			confirmMinutes = minutes;
			return;
		}
		void finishWalk(type, confirmMinutes ?? undefined);
	}

	function backdate() {
		// Read the prop before discarding: `type` is a live getter into the
		// page's derived lookup of the running walk, so once the walk is gone
		// it evaluates to null and the dialog would open on nothing.
		const backdated = type;
		discardWalk();
		onBackdate(backdated);
	}

	/** Reads the adjusted start as Stockholm wall-clock; junk is ignored. */
	function startChanged(value: string) {
		const instant = time.stockholmInputToUtc(value);
		if (instant) {
			adjustStart(instant);
		}
	}
</script>

{#if walk}
	<Card>
		<h2 class="font-bold">
			<span aria-hidden="true">{type.icon}</span>
			{locale.log.liveWalk.status(
				type.label,
				locale.units.minutes(String(elapsedMinutes(walk, clock.now)))
			)}
		</h2>

		<CountStepper
			name="pee"
			label={locale.activities.fields.pee}
			bind:value={() => walk.pee, (count) => updateWalk({ pee: count })}
		/>
		<CountStepper
			name="poop"
			label={locale.activities.fields.poop}
			bind:value={() => walk.poop, (count) => updateWalk({ poop: count })}
		/>
		<NoteField bind:value={() => walk.note, (text) => updateWalk({ note: text })} />

		{#if adjusting}
			<label class="flex flex-col gap-1">
				<span class="text-sm font-medium text-ink-label">{locale.log.liveWalk.adjustStart}</span>
				<input
					type="datetime-local"
					value={time.stockholmForInput(new Date(walk.startedAt))}
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
				onclick={discardWalk}
				class="flex-1 btn btn-secondary"
			>
				{locale.log.dialog.cancel}
			</button>
			<button
				type="button"
				onclick={finish}
				class="flex-1 btn btn-primary"
			>
				{locale.log.liveWalk.finish}
			</button>
		</div>

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
	</Card>
{/if}
