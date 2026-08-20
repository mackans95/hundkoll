// The pure logic of a live walk: reading it back from storage, measuring it,
// and turning it into the form fields the ?/log action already parses. The
// reactive, localStorage-backed shell lives in activeWalk.svelte.ts.
//
// Nothing here runs: a live walk is a persisted start instant, and every
// duration is derived from clocks at the moment it is asked for — which is
// why killing the app or rebooting the phone cannot lose or skew it.

import * as time from '$lib/time';

export type ActiveWalk = {
	/** The events row id, minted at start — replay-safe like the dialog's. */
	id: string;
	typeId: string;
	/** ISO instant. The one load-bearing value; everything else is counts. */
	startedAt: string;
	pee: number;
	poop: number;
	note: string;
};

/** Past this, Avsluta shows the computed duration for a check before saving. */
export const LONG_WALK_MINUTES = 240;

/**
 * Reads a stored walk back, refusing anything that does not hold together —
 * a garbled value must mean "no active walk", never a crash on the log page.
 */
export function parseStoredWalk(raw: string | null): ActiveWalk | null {
	if (!raw) {
		return null;
	}
	try {
		const value = JSON.parse(raw) as Partial<ActiveWalk>;
		if (typeof value.id !== 'string' || value.id === '') {
			return null;
		}
		if (typeof value.typeId !== 'string' || value.typeId === '') {
			return null;
		}
		if (typeof value.startedAt !== 'string' || isNaN(new Date(value.startedAt).getTime())) {
			return null;
		}
		return {
			id: value.id,
			typeId: value.typeId,
			startedAt: value.startedAt,
			pee: typeof value.pee === 'number' && value.pee > 0 ? Math.floor(value.pee) : 0,
			poop: typeof value.poop === 'number' && value.poop > 0 ? Math.floor(value.poop) : 0,
			note: typeof value.note === 'string' ? value.note : ''
		};
	} catch {
		return null;
	}
}

/** Whole minutes for the ticking display; 0 right after starting. */
export function elapsedMinutes(walk: ActiveWalk, now: Date): number {
	return Math.max(0, Math.floor((now.getTime() - new Date(walk.startedAt).getTime()) / 60_000));
}

/**
 * The duration the saved row gets: rounded, never below one minute — a clock
 * moved backwards mid-walk must not produce a zero or negative walk.
 */
export function durationMinutes(walk: ActiveWalk, now: Date): number {
	return Math.max(1, Math.round((now.getTime() - new Date(walk.startedAt).getTime()) / 60_000));
}

/**
 * The form fields exactly as the dialog would have posted them, so the
 * action, the queue and the summaries treat a live walk like any other.
 * occurred_at is the start — the same semantics as the dialog's prefill,
 * and what the stats views compute walk gaps from.
 */
export function buildWalkFields(
	walk: ActiveWalk,
	now: Date,
	minutesOverride?: number
): Record<string, string> {
	return {
		type_id: walk.typeId,
		detailed: '1',
		event_id: walk.id,
		occurred_at: time.stockholmForInput(new Date(walk.startedAt)),
		duration_min: String(Math.max(1, Math.round(minutesOverride ?? durationMinutes(walk, now)))),
		pee: String(walk.pee),
		poop: String(walk.poop),
		note: walk.note
	};
}
