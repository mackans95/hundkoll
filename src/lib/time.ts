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
