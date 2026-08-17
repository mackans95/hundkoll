// Turning values into Swedish text. Nothing here computes anything about
// time — that lives in time.ts.
//
// The Intl formatters sit at module scope on purpose. Constructing one costs
// 20–60x what formatting with it does, and these run once per chart column,
// so rebuilding them per call is the one thing in this file worth hoisting
// for. Everything cheap lives inside the function that owns it.

import * as locale from '$lib/locale';
import * as time from '$lib/time';

const numberFormat = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 1 });

/**
 * Writes a number the Swedish way, with a comma for the decimal point and
 * at most one decimal.
 * 5.66 → "5,7"
 */
export function swedishNumber(value: number): string {
	return numberFormat.format(value);
}

/**
 * Writes a duration in whichever unit keeps it short, switching to hours
 * once minutes stop being easy to read.
 * 36 → "36 min", 444 → "7,4 tim"
 */
export function minutesText(minutes: number): string {
	if (minutes < 90) {
		return locale.units.minutes(String(Math.round(minutes)));
	}

	return locale.units.hours(numberFormat.format(minutes / 60));
}

/**
 * Converts a fraction into a readable percentage, rounded to whole percent.
 * 0.923 → "92 %"
 */
export function percentageText(fraction: number): string {
	return locale.units.percent(Math.round(fraction * 100));
}

const eventTimeFormat = new Intl.DateTimeFormat('sv-SE', {
	timeZone: 'Europe/Stockholm',
	weekday: 'short',
	day: 'numeric',
	month: 'short',
	hour: '2-digit',
	minute: '2-digit'
});

/**
 * Writes when a logged event happened, in Stockholm time regardless of where
 * the code is running.
 * → "tors 14 aug 07:32"
 */
export function eventTime(date: Date): string {
	return eventTimeFormat.format(date);
}

/**
 * Labels a day for a chart axis, short enough to repeat across 30 columns.
 * "2026-08-14" → "14/8"
 */
export function dayLabel(iso: string): string {
	// Read back in UTC: the date is already a Stockholm day, so letting the
	// local timezone touch it again would shift it a second time.
	const day = new Date(`${iso}T00:00:00Z`);
	return `${day.getUTCDate()}/${day.getUTCMonth() + 1}`;
}

const monthFormat = new Intl.DateTimeFormat('sv-SE', { month: 'short', timeZone: 'UTC' });

/**
 * Labels a month for a chart axis, using the month the date falls in.
 * "2026-08-01" → "aug."
 */
export function monthLabel(iso: string): string {
	return monthFormat.format(new Date(`${iso}T00:00:00Z`));
}

/**
 * Labels a week for a chart axis, abbreviated to fit a tick.
 * "2026-08-10" → "v.33"
 */
export function weekLabel(iso: string): string {
	return locale.units.weekShort(time.isoWeek(iso));
}

/**
 * Names a week for a tooltip heading, where there is room to spell it out.
 * "2026-08-10" → "Vecka 33"
 */
export function weekHeading(iso: string): string {
	return locale.units.weekLong(time.isoWeek(iso));
}

/**
 * The units these two functions step through, taken from locale so the list
 * and the Swedish words for it cannot drift apart — a unit with no words, or
 * words with no unit, is now a compile error. `Intl.RelativeTimeFormatUnit`
 * would also accept the plural spellings, which have no entry in locale.
 */
type DurationUnit = keyof typeof locale.units.durationNames;

// Largest unit first: both functions below take the first one the value
// reaches, so a five-week gap reads as weeks rather than 35 days.
const RELATIVE_UNITS: [DurationUnit, number][] = [
	['year', 365 * 86_400_000],
	['month', 30 * 86_400_000],
	['week', 7 * 86_400_000],
	['day', 86_400_000],
	['hour', 3_600_000],
	['minute', 60_000]
];

const relativeFormat = new Intl.RelativeTimeFormat('sv', { numeric: 'auto' });

/**
 * Says how long ago something happened, or how far off it still is, relative
 * to now unless another moment is given.
 * → "för 5 veckor sedan", "igår", "om 8 dagar"
 */
export function swedishRelative(target: Date, base = new Date()): string {
	const diff = target.getTime() - base.getTime();

	for (const [unit, unitMs] of RELATIVE_UNITS) {
		if (Math.abs(diff) >= unitMs) {
			return relativeFormat.format(Math.round(diff / unitMs), unit);
		}
	}

	return locale.units.justNow;
}

/**
 * Names a length of time without saying which direction it points, so it can
 * be composed into a sentence like "3 dagar försenat".
 * 259_200_000 → "3 dagar"
 */
export function swedishDuration(ms: number): string {
	const abs = Math.abs(ms);

	for (const [unit, unitMs] of RELATIVE_UNITS) {
		if (abs >= unitMs || unit === 'minute') {
			const count = Math.max(1, Math.round(abs / unitMs));
			return locale.units.counted(count, locale.units.durationNames[unit]);
		}
	}

	return '';
}
