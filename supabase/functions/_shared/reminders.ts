// When a Status row deserves a notification, and what it says (plan 19).
// Self-contained: the Edge Function runs it under Deno and vitest tests it,
// and neither can resolve $lib. The two rules it repeats from
// $lib/status/schedule.ts are pinned to the originals by a parity test.

const TZ = 'Europe/Stockholm';

/** Mirrors $lib/status/schedule.ts: when a card turns amber. */
export const DAILY_AMBER_MS = 30 * 60_000;
export const RECURRING_AMBER_MS = 7 * 86_400_000;

/** Daily reminders are skipped from QUIET_FROM until QUIET_UNTIL, Stockholm time. */
const QUIET_FROM = 22;
const QUIET_UNTIL = 7;
/** Recurring reminders go out from this hour on their day. */
const MORNING = 9;

export type ReminderKind = 'soon' | 'week' | 'due';

/** The dog_care_status columns the rules read. */
export type ReminderRow = {
	type_id: string;
	label: string;
	icon: string | null;
	interval: number | null;
	interval_type: 'days' | 'hours' | 'average';
	last_at: string | null;
	due_at: string | null;
	due_from: string | null;
};

const partsFormat = new Intl.DateTimeFormat('en-US', {
	timeZone: TZ,
	year: 'numeric',
	month: '2-digit',
	day: '2-digit',
	hour: '2-digit',
	minute: '2-digit',
	second: '2-digit',
	hour12: false
});

function parts(at: Date): Record<string, string> {
	return Object.fromEntries(partsFormat.formatToParts(at).map((p) => [p.type, p.value]));
}

/** The Stockholm day ("2026-08-14") and hour an instant falls on. */
function wallClock(at: Date): { day: string; hour: number } {
	const p = parts(at);
	return { day: `${p.year}-${p.month}-${p.day}`, hour: +p.hour % 24 };
}

/** How far Stockholm is ahead of UTC at an instant, as in $lib/time.ts. */
function offsetMs(at: Date): number {
	const p = parts(at);
	const wall = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
	return wall - Math.floor(at.getTime() / 1000) * 1000;
}

/** The instant a Stockholm clock shows `hour`:00 on `day`. */
function stockholmAt(day: string, hour: number): Date {
	const guess = new Date(`${day}T${String(hour).padStart(2, '0')}:00:00Z`);
	// The offset at the guess can differ from the answer's across a DST switch.
	const once = new Date(guess.getTime() - offsetMs(guess));
	return new Date(guess.getTime() - offsetMs(once));
}

function addDays(day: string, days: number): string {
	const d = new Date(`${day}T12:00:00Z`);
	d.setUTCDate(d.getUTCDate() + days);
	return d.toISOString().slice(0, 10);
}

export function isDaily(row: Pick<ReminderRow, 'interval_type'>): boolean {
	return row.interval_type !== 'days';
}

function isScheduled(row: Pick<ReminderRow, 'interval' | 'interval_type'>): boolean {
	return row.interval_type === 'average' || row.interval !== null;
}

/** Mirrors awaitingNewDay in $lib/status/schedule.ts. */
export function awaitingNewDay(row: ReminderRow, now: Date): boolean {
	const from = row.due_from ?? row.last_at;
	if (!isDaily(row) || !from) {
		return false;
	}
	return wallClock(now).day > wallClock(new Date(from)).day;
}

/**
 * Which reminder, if any, the row is due right now. A window rather than an
 * instant, so a missed minute still delivers later; the caller's claim on
 * (type, kind, due_at) is what keeps a window from sending twice.
 */
export function reminderDue(row: ReminderRow, away: boolean, now: Date): ReminderKind | null {
	if (!isScheduled(row) || !row.due_at) {
		return null;
	}
	const due = new Date(row.due_at);
	const from = new Date(row.due_from ?? row.last_at ?? row.due_at);
	const hour = wallClock(now).hour;
	const t = now.getTime();

	if (isDaily(row)) {
		if (away || awaitingNewDay(row, now) || hour >= QUIET_FROM || hour < QUIET_UNTIL) {
			return null;
		}
		return t >= due.getTime() - DAILY_AMBER_MS && t < due.getTime() ? 'soon' : null;
	}

	// Recurring: daytime only, and never for a moment before the last one was
	// logged, which a schedule shorter than a week would otherwise produce.
	if (hour < MORNING || hour >= QUIET_FROM) {
		return null;
	}
	const dueDay = wallClock(due).day;
	const dueMorning = stockholmAt(dueDay, MORNING);
	if (t >= dueMorning.getTime()) {
		return dueMorning > from ? 'due' : null;
	}
	const weekMorning = stockholmAt(addDays(dueDay, -RECURRING_AMBER_MS / 86_400_000), MORNING);
	return t >= weekMorning.getTime() && weekMorning > from ? 'week' : null;
}

const clockFormat = new Intl.DateTimeFormat('sv-SE', {
	timeZone: TZ,
	hour: '2-digit',
	minute: '2-digit'
});
const dateFormat = new Intl.DateTimeFormat('sv-SE', {
	timeZone: TZ,
	day: 'numeric',
	month: 'short'
});

/** The notification's text. Swedish, in the app's voice (locale.ts). */
export function reminderMessage(
	row: ReminderRow,
	kind: ReminderKind
): { title: string; body: string } {
	const name = row.icon ? `${row.icon} ${row.label}` : row.label;
	const last = row.last_at ? new Date(row.last_at) : null;

	switch (kind) {
		case 'soon':
			return {
				title: `${name} om 30 min`,
				body: last ? `Senast kl. ${clockFormat.format(last)}` : ''
			};
		case 'week':
			return {
				title: `${name} om en vecka`,
				body: last ? `Senast ${dateFormat.format(last)}` : ''
			};
		case 'due': {
			const every = row.interval === null ? null : `var ${row.interval}:e dag`;
			return {
				title: `${name} idag`,
				body: [last && `Senast ${dateFormat.format(last)}`, every].filter(Boolean).join(' · ')
			};
		}
	}
}
