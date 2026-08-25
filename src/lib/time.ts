// Time *computation*: timezone conversion and calendar arithmetic; the words
// live in format.ts. Europe/Stockholm is the app's wall-clock timezone, the
// database stores UTC, and the server runs in UTC — so datetime-local values
// must be converted explicitly.

const TZ = 'Europe/Stockholm';

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

/**
 * Reads what a clock on a Stockholm wall would show at this instant, and
 * returns that reading as if it were UTC — the shifted number a comparison
 * against the real instant can measure.
 */
function wallClockUtcMs(at: Date): number {
	const parts = Object.fromEntries(partsFormat.formatToParts(at).map((p) => [p.type, p.value]));
	return Date.UTC(
		+parts.year,
		+parts.month - 1,
		+parts.day,
		+parts.hour % 24,
		+parts.minute,
		+parts.second
	);
}

/**
 * How far Stockholm is ahead of UTC at a given instant, in milliseconds.
 * Two hours in summer, one in winter.
 */
function offsetMs(at: Date): number {
	return wallClockUtcMs(at) - at.getTime();
}

/**
 * Reads a datetime-local input value as a Stockholm wall-clock time and
 * returns the instant it refers to, or null if the value is malformed.
 * "2026-08-14T02:30" → 2026-08-14T00:30:00Z
 */
export function stockholmInputToUtc(input: string): Date | null {
	if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input)) {
		return null;
	}

	const guess = new Date(`${input}:00Z`);
	if (isNaN(guess.getTime())) {
		return null;
	}

	// The offset at the guessed instant can differ from the offset at the
	// actual instant across a DST switch; one correction pass settles it.
	const once = new Date(guess.getTime() - offsetMs(guess));
	return new Date(guess.getTime() - offsetMs(once));
}

/**
 * Whether two instants fall in the same minute. Lets an edit tell "the time
 * field was not touched" from "the time was moved to :00", which a
 * minute-precision field cannot say for itself.
 */
export function sameMinute(a: Date, b: Date): boolean {
	return Math.floor(a.getTime() / 60_000) === Math.floor(b.getTime() / 60_000);
}

const inputFormat = new Intl.DateTimeFormat('sv-SE', {
	timeZone: TZ,
	year: 'numeric',
	month: '2-digit',
	day: '2-digit',
	hour: '2-digit',
	minute: '2-digit'
});

/**
 * Writes an instant as the Stockholm wall-clock time a datetime-local input
 * expects — the inverse of stockholmInputToUtc, to minute precision.
 * 2026-08-14T07:15:00Z → "2026-08-14T09:15"
 */
export function stockholmForInput(at: Date): string {
	return inputFormat.format(at).replace(' ', 'T');
}

/**
 * Gives the current Stockholm time in the shape a datetime-local input
 * expects, for pre-filling the log dialog.
 * → "2026-08-14T09:15"
 */
export function stockholmNowForInput(): string {
	return stockholmForInput(new Date());
}

/**
 * The Stockholm calendar day an instant falls on — the day it felt like,
 * which is the day every view groups by.
 * 2026-08-14T22:30:00Z → "2026-08-15"
 */
export function stockholmDay(at: Date): string {
	return stockholmForInput(at).slice(0, 10);
}

/**
 * The instants a Stockholm month starts and ends, for querying it. Null when
 * the month is not a real one, so a hand-edited URL cannot widen the query.
 * "2026-08" → 2026-07-31T22:00Z … 2026-08-31T22:00Z (both CEST midnights)
 */
export function monthBoundsUtc(month: string): { from: string; to: string } | null {
	if (!/^\d{4}-\d{2}$/.test(month)) {
		return null;
	}

	// Via the input parser, so the bounds sit at Stockholm midnight whichever
	// side of a DST switch the month falls on.
	const from = stockholmInputToUtc(`${month}-01T00:00`);
	// Checked before doing any arithmetic: the pattern above admits "2026-13",
	// and addMonths would throw on it rather than report it.
	if (!from) {
		return null;
	}

	const to = stockholmInputToUtc(`${addMonths(`${month}-01`, 1)}T00:00`);
	return to ? { from: from.toISOString(), to: to.toISOString() } : null;
}

/**
 * The cells of a Monday-first month grid: every day of the month, with the
 * leading and trailing blanks that keep the columns under mån–sön.
 * "2026-08" → [null ×5, "2026-08-01" … "2026-08-31", null ×6]
 */
export function calendarDays(month: string): (string | null)[] {
	const first = `${month}-01`;
	// getUTCDay counts from Sunday; the app's weeks start on Monday.
	const leading = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7;
	// Day 0 of the next month is the last day of this one.
	const length = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 0)).getUTCDate();

	const cells: (string | null)[] = Array(leading).fill(null);
	for (let day = 1; day <= length; day++) {
		cells.push(addDays(first, day - 1));
	}
	// Complete the last week, so the grid keeps its shape.
	while (cells.length % 7 !== 0) {
		cells.push(null);
	}
	return cells;
}

/**
 * Moves a date-only string by a number of days, forwards or backwards.
 * ("2026-08-14", -3) → "2026-08-11"
 */
export function addDays(iso: string, days: number): string {
	// Date-only values carry no time, so UTC arithmetic cannot drift them.
	const date = new Date(`${iso}T00:00:00Z`);
	date.setUTCDate(date.getUTCDate() + days);
	return date.toISOString().slice(0, 10);
}

/**
 * Moves a date-only string by a number of months and snaps to the 1st, so
 * the result names a month rather than a day within one.
 * ("2026-08-14", -1) → "2026-07-01"
 */
export function addMonths(iso: string, months: number): string {
	const date = new Date(`${iso.slice(0, 7)}-01T00:00:00Z`);
	date.setUTCMonth(date.getUTCMonth() + months);
	return date.toISOString().slice(0, 10);
}

/**
 * Finds the Monday of the ISO week a date falls in, which is where a week
 * bucket starts.
 * "2026-08-14" (a Friday) → "2026-08-10"
 */
export function mondayOf(iso: string): string {
	const dayOfWeek = new Date(`${iso}T00:00:00Z`).getUTCDay();
	return addDays(iso, -((dayOfWeek + 6) % 7));
}

/**
 * Gives the ISO 8601 week number, which is the week numbering used in
 * Sweden.
 * "2026-08-14" → 33
 */
export function isoWeek(iso: string): number {
	// Shift to the Thursday of this week: ISO weeks belong to whichever year
	// their Thursday lands in, so counting from there handles the turn of the
	// year without a special case.
	const thursday = new Date(`${iso}T00:00:00Z`);
	thursday.setUTCDate(thursday.getUTCDate() + 4 - (((thursday.getUTCDay() + 6) % 7) + 1));
	const yearStart = Date.UTC(thursday.getUTCFullYear(), 0, 1);
	return Math.ceil(((thursday.getTime() - yearStart) / 86_400_000 + 1) / 7);
}

/**
 * Lists the run of days ending on the given one, oldest first, so a chart
 * can zero-fill the days the database had nothing to say about.
 * ("2026-08-14", 3) → ["2026-08-12", "2026-08-13", "2026-08-14"]
 */
export function lastDays(today: string, count: number): string[] {
	const days: string[] = [];
	for (let i = count - 1; i >= 0; i--) {
		days.push(addDays(today, -i));
	}
	return days;
}
