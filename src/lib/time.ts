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

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
	['year', 365 * 86_400_000],
	['month', 30 * 86_400_000],
	['week', 7 * 86_400_000],
	['day', 86_400_000],
	['hour', 3_600_000],
	['minute', 60_000]
];

const relativeFormat = new Intl.RelativeTimeFormat('sv', { numeric: 'auto' });

/** "för 5 veckor sedan", "igår", "om 8 dagar". */
export function svRelative(target: Date, base = new Date()): string {
	const diff = target.getTime() - base.getTime();
	for (const [unit, unitMs] of RELATIVE_UNITS) {
		if (Math.abs(diff) >= unitMs) {
			return relativeFormat.format(Math.round(diff / unitMs), unit);
		}
	}
	return 'nyss';
}

const DURATION_NAMES: Record<string, [singular: string, plural: string]> = {
	year: ['år', 'år'],
	month: ['månad', 'månader'],
	week: ['vecka', 'veckor'],
	day: ['dag', 'dagar'],
	hour: ['timme', 'timmar'],
	minute: ['minut', 'minuter']
};

/** "3 dagar", "5 veckor" — for composing texts like "3 dagar försenat". */
export function svDuration(ms: number): string {
	const abs = Math.abs(ms);
	for (const [unit, unitMs] of RELATIVE_UNITS) {
		if (abs >= unitMs || unit === 'minute') {
			const n = Math.max(1, Math.round(abs / unitMs));
			const [singular, plural] = DURATION_NAMES[unit];
			return `${n} ${n === 1 ? singular : plural}`;
		}
	}
	return '';
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
