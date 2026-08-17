// Time *computation*: timezone conversion and calendar arithmetic.
// Turning any of this into text is format.ts's job.
//
// Europe/Stockholm is the app's wall-clock timezone; the database stores
// timestamptz (UTC). The server runs in UTC on Vercel, so datetime-local
// input values must be converted explicitly.

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

/** The instant's Stockholm wall-clock time, expressed as a UTC timestamp. */
function wallClockUtcMs(at: Date): number {
	const p = Object.fromEntries(partsFormat.formatToParts(at).map((x) => [x.type, x.value]));
	return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
}

function offsetMs(at: Date): number {
	return wallClockUtcMs(at) - at.getTime();
}

/** Interpret a datetime-local value ("YYYY-MM-DDTHH:mm") as Stockholm time. */
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

/** Current Stockholm time formatted for a datetime-local input value. */
export function stockholmNowForInput(): string {
	const s = new Intl.DateTimeFormat('sv-SE', {
		timeZone: TZ,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit'
	}).format(new Date());
	return s.replace(' ', 'T');
}

/** Add days to a YYYY-MM-DD string (UTC arithmetic on date-only values). */
export function addDays(iso: string, days: number): string {
	const d = new Date(`${iso}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + days);
	return d.toISOString().slice(0, 10);
}

/** Add months to a YYYY-MM-DD string, snapping to the 1st of the month. */
export function addMonths(iso: string, months: number): string {
	const d = new Date(`${iso.slice(0, 7)}-01T00:00:00Z`);
	d.setUTCMonth(d.getUTCMonth() + months);
	return d.toISOString().slice(0, 10);
}

/** Monday of the ISO week containing the given YYYY-MM-DD date. */
export function mondayOf(iso: string): string {
	const dow = new Date(`${iso}T00:00:00Z`).getUTCDay();
	return addDays(iso, -((dow + 6) % 7));
}

/** ISO 8601 week number — the week numbers used in Sweden. */
export function isoWeek(iso: string): number {
	const d = new Date(`${iso}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + 4 - (((d.getUTCDay() + 6) % 7) + 1));
	const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
	return Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7);
}

/** The last `count` days ending today, oldest first, as YYYY-MM-DD. */
export function lastDays(today: string, count: number): string[] {
	const out: string[] = [];
	for (let i = count - 1; i >= 0; i--) {
		out.push(addDays(today, -i));
	}
	return out;
}
