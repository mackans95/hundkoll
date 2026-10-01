// The device-local live walk. Deliberately per-device (whoever holds the
// leash holds the state) and deliberately localStorage: synchronous, survives
// reload, kill and reboot, and needs no schema. The finished row goes through
// the same queue as every dialog log and is indistinguishable from one.

import { invalidateAll } from '$app/navigation';
import { isNativeApp, lockScreenState, takeLockScreenOutbox } from '$lib/native';
import type { EventType } from '$lib/types/domain';
import { buildWalkFields, parseStoredWalk, reconcileWalk, type ActiveWalk } from './liveWalk';
import { queueLog } from './submit';

const KEY = 'hundkoll:active-walk:v1';

/**
 * Module-level state on the same contract as offlineQueue: populated only in
 * the browser, after mount — the server always renders "no walk".
 */
export const activeWalk = $state<{ current: ActiveWalk | null }>({ current: null });

/**
 * False until the page's walk has been lined up with the lock screen's, so the
 * card cannot push its stale counts over taps made there (plan 20).
 */
export const lockScreen = $state({ synced: false });

/** Reads the persisted walk, if one is still running from before. */
export function loadActiveWalk(): void {
	try {
		activeWalk.current = parseStoredWalk(localStorage.getItem(KEY));
	} catch {
		// Storage denied: nothing can have survived to be loaded.
	}
	lockScreen.synced = false;
	void syncWithLockScreen();
}

/**
 * Takes in what happened on the lock screen: taps the card has not seen, a
 * walk Spara stored, and walks Spara could not send, which go to the queue.
 * Run on load and from catchUp, so a resume after the walk sees all of it.
 */
export async function syncWithLockScreen(): Promise<void> {
	if (!isNativeApp()) {
		lockScreen.synced = true;
		return;
	}
	try {
		const outcome = reconcileWalk(activeWalk.current, await lockScreenState());
		if (outcome.kind === 'adopt') {
			updateWalk({ pee: outcome.pee, poop: outcome.poop });
		} else if (outcome.kind === 'saved') {
			discardWalk();
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
		console.warn('lock-screen walk sync failed:', error);
	} finally {
		lockScreen.synced = true;
	}
}

function persist(): void {
	try {
		if (activeWalk.current) {
			localStorage.setItem(KEY, JSON.stringify(activeWalk.current));
		} else {
			localStorage.removeItem(KEY);
		}
	} catch (error) {
		// Live mode still works this session; it just cannot survive a reload.
		console.warn('active walk write failed:', error);
	}
}

/** Starts a walk right now — unless one is already running: one walk max. */
export function startWalk(typeId: string): void {
	if (activeWalk.current) {
		return;
	}
	activeWalk.current = {
		id: crypto.randomUUID(),
		typeId,
		startedAt: new Date().toISOString(),
		pee: 0,
		poop: 0,
		note: ''
	};
	persist();
}

/** Live edits mid-walk: every tap and keystroke writes through to storage. */
export function updateWalk(patch: Partial<Pick<ActiveWalk, 'pee' | 'poop' | 'note'>>): void {
	if (!activeWalk.current) {
		return;
	}
	activeWalk.current = { ...activeWalk.current, ...patch };
	persist();
}

/** Moves the start ("forgot to tap when we left"), never past now. */
export function adjustStart(instant: Date): void {
	if (!activeWalk.current) {
		return;
	}
	const capped = Math.min(instant.getTime(), Date.now());
	activeWalk.current = { ...activeWalk.current, startedAt: new Date(capped).toISOString() };
	persist();
}

/** Throws the walk away unsaved. */
export function discardWalk(): void {
	activeWalk.current = null;
	persist();
}

/**
 * Ends the walk: builds the same fields the dialog would post and hands them
 * to the shared queue path. The card disappears the moment the row is queued;
 * sending happens in the background like every other log.
 */
export async function finishWalk(
	type: Pick<EventType, 'id' | 'label' | 'icon'>,
	minutesOverride?: number
): Promise<void> {
	const walk = activeWalk.current;
	if (!walk) {
		return;
	}
	const outcome = await queueLog(
		type,
		buildWalkFields(walk, new Date(), minutesOverride),
		discardWalk
	);
	// buildWalkFields writes these fields itself, so a rejection is a bug here
	// rather than something the user typed. The walk is deliberately kept:
	// discardWalk only runs once the row is queued.
	if (!outcome.ok) {
		console.warn('finishing the walk was rejected:', outcome.message);
	}
}
