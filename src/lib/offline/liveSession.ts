// The pure logic of a live session: reading it back from storage, measuring
// it, and turning it into the form fields the ?/log action already parses.
// The reactive, localStorage-backed shell lives in activeSession.svelte.ts.
//
// Two kinds (plan 23): a counting session (the walk) is counted while it runs
// and saved at once; a timing session (Ensamtid) is only timed, and its end
// opens the type's own dialog to ask the rest.
//
// Nothing here runs: a session is a persisted start instant, and every
// duration is derived from clocks at the moment it is asked for — which is
// why killing the app or rebooting the phone cannot lose or skew it.

import * as time from '$lib/time';

export type LiveSession = {
	/** The events row id, minted at start — replay-safe like the dialog's. */
	id: string;
	typeId: string;
	/** ISO instant. The one load-bearing value; everything else follows from it. */
	startedAt: string;
	/** Set by Hemma: a timing session stopped, waiting for its answer. */
	endedAt: string | null;
	/** What a counting session counts while it runs: the walk's kiss and bajs. */
	counts: Record<string, number>;
	note: string;
};

/** Past this, Avsluta shows the computed duration for a check before saving. */
export const LONG_SESSION_MINUTES = 240;

/** A count that cannot be trusted as stored: negative, fractional or not a number. */
function cleanCount(value: unknown): number {
	return typeof value === 'number' && value > 0 ? Math.floor(value) : 0;
}

/**
 * Reads a stored session back, refusing anything that does not hold together:
 * a garbled value must mean "nothing running", never a crash on the log page.
 * A walk stored before plan 23 kept `pee` and `poop` at the top; it is read
 * into `counts`, so a walk running across the deploy survives it.
 */
export function parseStoredSession(raw: string | null): LiveSession | null {
	if (!raw) {
		return null;
	}
	try {
		const value = JSON.parse(raw) as Record<string, unknown>;
		if (typeof value.id !== 'string' || value.id === '') {
			return null;
		}
		if (typeof value.typeId !== 'string' || value.typeId === '') {
			return null;
		}
		if (typeof value.startedAt !== 'string' || isNaN(new Date(value.startedAt).getTime())) {
			return null;
		}
		const stored =
			value.counts && typeof value.counts === 'object'
				? (value.counts as Record<string, unknown>)
				: 'pee' in value || 'poop' in value
					? { pee: value.pee, poop: value.poop }
					: {};
		const endedAt =
			typeof value.endedAt === 'string' && !isNaN(new Date(value.endedAt).getTime())
				? value.endedAt
				: null;
		return {
			id: value.id,
			typeId: value.typeId,
			startedAt: value.startedAt,
			endedAt,
			counts: Object.fromEntries(Object.entries(stored).map(([key, n]) => [key, cleanCount(n)])),
			note: typeof value.note === 'string' ? value.note : ''
		};
	} catch {
		return null;
	}
}

/** Where the clock stops: Hemma's instant once pressed, otherwise now. */
function end(session: LiveSession, now: Date): number {
	return session.endedAt ? new Date(session.endedAt).getTime() : now.getTime();
}

/** Whole minutes for the ticking display; 0 right after starting. */
export function elapsedMinutes(session: LiveSession, now: Date): number {
	return Math.max(
		0,
		Math.floor((end(session, now) - new Date(session.startedAt).getTime()) / 60_000)
	);
}

/**
 * The duration the saved row gets: rounded, never below one minute — a clock
 * moved backwards mid-session must not produce a zero or negative length.
 */
export function durationMinutes(session: LiveSession, now: Date): number {
	return Math.max(
		1,
		Math.round((end(session, now) - new Date(session.startedAt).getTime()) / 60_000)
	);
}

/**
 * The form fields exactly as the dialog would have posted them, so the
 * action, the queue and the summaries treat a live session like any other.
 * occurred_at is the start — the same semantics as the dialog's prefill,
 * and what the stats views compute walk gaps from.
 */
export function buildSessionFields(
	session: LiveSession,
	now: Date,
	minutesOverride?: number
): Record<string, string> {
	return {
		type_id: session.typeId,
		detailed: '1',
		event_id: session.id,
		occurred_at: time.stockholmForInput(new Date(session.startedAt)),
		duration_min: String(Math.max(1, Math.round(minutesOverride ?? durationMinutes(session, now)))),
		...Object.fromEntries(Object.entries(session.counts).map(([key, n]) => [key, String(n)])),
		note: session.note
	};
}

/**
 * The fields that do not change by the end of the session, handed to the
 * lock screen (plan 20) so it can save without the page: buildSessionFields
 * minus duration_min and the counts, which it fills in at the tap.
 */
export function fixedSessionFields(session: LiveSession): Record<string, string> {
	const fields = buildSessionFields(session, new Date());
	delete fields.duration_min;
	for (const key of Object.keys(session.counts)) {
		delete fields[key];
	}
	return fields;
}

/** What the lock screen reports: the session it holds, if any, and the last one Spara stored. */
export type LockScreenState = {
	id?: string;
	pee?: number;
	poop?: number;
	/** Hemma pressed on the lock screen, as epoch milliseconds. */
	endedAt?: number | null;
	savedId?: string | null;
};

export type Reconciled =
	| { kind: 'keep' }
	/** Taps on the lock screen the page has not seen. */
	| { kind: 'adopt'; counts: Record<string, number> }
	/** Hemma on the lock screen: the session stopped there, and wants its answer. */
	| { kind: 'stopped'; endedAt: string }
	/** Spara stored it (or queued it in the outbox): the page's copy is done. */
	| { kind: 'saved' };

/**
 * How the page's session lines up with the lock screen's. While the
 * notification is up native holds the counts and the end, so for the same
 * session its numbers win; a session Spara has taken is over, whatever the
 * page still holds.
 */
export function reconcileSession(local: LiveSession | null, native: LockScreenState): Reconciled {
	if (!local) {
		return { kind: 'keep' };
	}
	if (native.savedId === local.id) {
		return { kind: 'saved' };
	}
	if (native.id !== local.id) {
		return { kind: 'keep' };
	}
	if (native.endedAt && !local.endedAt) {
		return { kind: 'stopped', endedAt: new Date(native.endedAt).toISOString() };
	}
	const counts = { ...local.counts };
	for (const key of ['pee', 'poop'] as const) {
		const n = native[key];
		if (key in counts && typeof n === 'number') counts[key] = n;
	}
	const changed = Object.keys(counts).some((key) => counts[key] !== local.counts[key]);
	return changed ? { kind: 'adopt', counts } : { kind: 'keep' };
}
