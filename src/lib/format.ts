// Turning values into Swedish text. Nothing here computes anything about
// time — that lives in time.ts.

import * as time from '$lib/time';

const oneDecimal = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 1 });

export function svNum(value: number, digits = 1): string {
	return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: digits }).format(value);
}

/** "36 min" below 90 minutes, "7,4 tim" above. */
export function minutesText(minutes: number): string {
	if (minutes < 90) {
		return `${Math.round(minutes)} min`;
	}
	return `${oneDecimal.format(minutes / 60)} tim`;
}

/** 0.923 → "92 %" */
export function pctText(fraction: number): string {
	return `${Math.round(fraction * 100)} %`;
}

/** A logged event's timestamp: "tors 14 aug 07:32". */
export const eventTimeFormat = new Intl.DateTimeFormat('sv-SE', {
	timeZone: 'Europe/Stockholm',
	weekday: 'short',
	day: 'numeric',
	month: 'short',
	hour: '2-digit',
	minute: '2-digit'
});

// Chart axis and tooltip labels. The dates are already Stockholm days, so
// they are read back in UTC to avoid shifting them a second time.
const monthFormat = new Intl.DateTimeFormat('sv-SE', { month: 'short', timeZone: 'UTC' });

/** "14/8" */
export function dayLabel(iso: string): string {
	const d = new Date(`${iso}T00:00:00Z`);
	return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
}

/** "aug" */
export function monthLabel(iso: string): string {
	return monthFormat.format(new Date(`${iso}T00:00:00Z`));
}

/** "v.33" — short enough for an axis tick. */
export function weekLabel(iso: string): string {
	return `v.${time.isoWeek(iso)}`;
}

/** "Vecka 33" — for a tooltip heading, where there is room. */
export function weekHeading(iso: string): string {
	return `Vecka ${time.isoWeek(iso)}`;
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
