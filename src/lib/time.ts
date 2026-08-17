// Time *computation*: timezone conversion and calendar arithmetic.
// Turning any of this into text is format.ts's job.
//
// Europe/Stockholm is the app's wall-clock timezone; the database stores
// timestamptz (UTC). The server runs in UTC on Vercel, so datetime-local
// input values must be converted explicitly.
//
// As in format.ts, the Intl formatters are module-level because they are
// expensive to construct; everything else lives in the function that owns it.

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

const inputFormat = new Intl.DateTimeFormat('sv-SE', {
	timeZone: TZ,
	year: 'numeric',
	month: '2-digit',
	day: '2-digit',
	hour: '2-digit',
	minute: '2-digit'
});

/**
 * Gives the current Stockholm time in the shape a datetime-local input
 * expects, for pre-filling the log dialog.
 * → "2026-08-14T09:15"
 */
export function stockholmNowForInput(): string {
	return inputFormat.format(new Date()).replace(' ', 'T');
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
