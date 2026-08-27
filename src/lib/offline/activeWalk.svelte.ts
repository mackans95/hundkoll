// The device-local live walk. Deliberately per-device (whoever holds the
// leash holds the state) and deliberately localStorage: synchronous, survives
// reload, kill and reboot, and needs no schema. The finished row goes through
// the same queue as every dialog log and is indistinguishable from one.

import type { EventType } from '$lib/types/domain';
import { buildWalkFields, parseStoredWalk, type ActiveWalk } from './liveWalk';
import { queueLog } from './submit';

const KEY = 'hundkoll:active-walk:v1';

/**
 * Module-level state on the same contract as offlineQueue: populated only in
 * the browser, after mount — the server always renders "no walk".
 */
export const activeWalk = $state<{ current: ActiveWalk | null }>({ current: null });

/** Reads the persisted walk, if one is still running from before. */
export function loadActiveWalk(): void {
	try {
		activeWalk.current = parseStoredWalk(localStorage.getItem(KEY));
	} catch {
		// Storage denied: nothing can have survived to be loaded.
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
