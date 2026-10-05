// The device-local live session: a walk or an Ensamtid (plan 23). Deliberately
// per-device (whoever holds the leash, or left the house, holds the state) and
// deliberately localStorage: synchronous, survives reload, kill and reboot, and
// needs no schema. The finished row goes through the same queue as every
// dialog log and is indistinguishable from one.

import { invalidateAll } from '$app/navigation';
import { fieldsFor } from '$lib/events/fields';
import { isNativeApp, lockScreenState, takeLockScreenOutbox } from '$lib/native';
import type { EventType } from '$lib/types/domain';
import {
	buildSessionFields,
	parseStoredSession,
	reconcileSession,
	type LiveSession
} from './liveSession';
import { queueLog } from './submit';

// The walk's old key: a walk running across the deploy is read from it.
const KEY = 'hundkoll:active-walk:v1';

/**
 * Module-level state on the same contract as offlineQueue: populated only in
 * the browser, after mount — the server always renders "nothing running".
 */
export const activeSession = $state<{ current: LiveSession | null }>({ current: null });

/**
 * False until the page's session has been lined up with the lock screen's, so
 * the card cannot push its stale counts over taps made there (plan 20).
 */
export const lockScreen = $state({ synced: false });

// Hemma pressed on the lock screen wants its answer asked. The log page
// registers how; until it does (the app opened on another tab), it waits.
let onHome: (() => void) | null = null;
let homePending = false;

/**
 * Registers what Hemma on the lock screen does: the log page opens the answer.
 * A Hemma taken in before the page was there is answered straight away.
 */
export function handleHome(answer: () => void): () => void {
	onHome = answer;
	if (homePending) {
		homePending = false;
		answer();
	}
	return () => {
		onHome = null;
	};
}

/** Reads the persisted session, if one is still running from before. */
export function loadActiveSession(): void {
	try {
		activeSession.current = parseStoredSession(localStorage.getItem(KEY));
	} catch {
		// Storage denied: nothing can have survived to be loaded.
	}
	lockScreen.synced = false;
	void syncWithLockScreen();
}

/**
 * Takes in what happened on the lock screen: taps the card has not seen, a
 * Hemma, a walk Spara stored, and walks Spara could not send, which go to the
 * queue. Run on load and from catchUp, so a resume afterwards sees all of it.
 */
export async function syncWithLockScreen(): Promise<void> {
	if (!isNativeApp()) {
		lockScreen.synced = true;
		return;
	}
	try {
		const outcome = reconcileSession(activeSession.current, await lockScreenState());
		if (outcome.kind === 'adopt') {
			update({ counts: outcome.counts });
		} else if (outcome.kind === 'stopped') {
			update({ endedAt: outcome.endedAt });
			if (onHome) onHome();
			else homePending = true;
		} else if (outcome.kind === 'saved') {
			discardSession();
		}

		// Only once someone is looking: taking the outbox clears its "sent when you
		// open the app" notice, which a lock-screen tap must not do in the background.
		const unsent = document.visibilityState === 'visible' ? await takeLockScreenOutbox() : [];
		for (const item of unsent) {
			await queueLog(
				{ id: item.fields.type_id, label: item.label, icon: item.icon || null },
				item.fields
			);
		}
		// Stored by the lock screen, so the queue never sent it: the list needs a re-read.
		if (outcome.kind === 'saved' && unsent.length === 0) {
			await invalidateAll();
		}
	} catch (error) {
		console.warn('lock-screen session sync failed:', error);
	} finally {
		lockScreen.synced = true;
	}
}

function persist(): void {
	try {
		if (activeSession.current) {
			localStorage.setItem(KEY, JSON.stringify(activeSession.current));
		} else {
			localStorage.removeItem(KEY);
		}
	} catch (error) {
		// Live mode still works this session; it just cannot survive a reload.
		console.warn('live session write failed:', error);
	}
}

function update(patch: Partial<LiveSession>): void {
	if (!activeSession.current) {
		return;
	}
	activeSession.current = { ...activeSession.current, ...patch };
	persist();
}

/**
 * Starts a session right now, unless one is already running: one at a time.
 * A counting type starts its counts at zero, one per count field it declares.
 */
export function startSession(typeId: string): void {
	if (activeSession.current) {
		return;
	}
	const counts = Object.fromEntries(
		fieldsFor(typeId)
			.filter((field) => field.input === 'count')
			.map((field) => [field.name, 0])
	);
	activeSession.current = {
		id: crypto.randomUUID(),
		typeId,
		startedAt: new Date().toISOString(),
		endedAt: null,
		counts,
		note: '',
		plannedMin: null
	};
	persist();
}

/** A tap on a counter mid-walk; written through to storage. */
export function updateCount(name: string, count: number): void {
	if (activeSession.current) {
		update({ counts: { ...activeSession.current.counts, [name]: count } });
	}
}

/** Every keystroke of the note, written through to storage. */
export function updateNote(note: string): void {
	update({ note });
}

/** Moves the start ("forgot to tap when we left"), never past now. */
export function adjustStart(instant: Date): void {
	const capped = Math.min(instant.getTime(), Date.now());
	update({ startedAt: new Date(capped).toISOString() });
}

/** The planned length, or null to clear it (plan 24). */
export function setPlan(minutes: number | null): void {
	update({ plannedMin: minutes });
}

/**
 * Hemma: stops a timing session's clock. Its answer is asked by the type's own
 * dialog, and until it is saved the session stays stopped, never running again.
 */
export function stopSession(): void {
	if (activeSession.current && !activeSession.current.endedAt) {
		update({ endedAt: new Date().toISOString() });
	}
}

/** Throws the session away unsaved. */
export function discardSession(): void {
	activeSession.current = null;
	persist();
}

/**
 * Ends a counting session (the walk): builds the same fields the dialog would
 * post and hands them to the shared queue path. The card disappears the moment
 * the row is queued; sending happens in the background like every other log.
 */
export async function finishSession(
	type: Pick<EventType, 'id' | 'label' | 'icon'>,
	minutesOverride?: number
): Promise<void> {
	const session = activeSession.current;
	if (!session) {
		return;
	}
	const outcome = await queueLog(
		type,
		buildSessionFields(session, new Date(), minutesOverride),
		discardSession
	);
	// buildSessionFields writes these fields itself, so a rejection is a bug here
	// rather than something the user typed. The session is deliberately kept:
	// discardSession only runs once the row is queued.
	if (!outcome.ok) {
		console.warn('finishing the session was rejected:', outcome.message);
	}
}
