// Every word the app shows, in one place: Swedish in the UI, English in the
// code. One language, no runtime loading — a plain module the compiler checks.
//
// Everything is `as const` so a hover shows the actual words rather than
// `string`, and anything with a value in it is a function, so the grammar
// around the value stays next to the words.
//
// Deliberately elsewhere: activity names are rows in the event_types table,
// and the installed app's name is in static/manifest.webmanifest.

import type { Period } from '$lib/types/domain';

/** Named separately so pageTitle can use it without referring to its own object. */
const APP_NAME = 'Hundkoll';

export const app = {
	name: APP_NAME,
	/** Browser tab title. The screen comes first so tabs stay tellable apart. */
	pageTitle: (screen: string) => `${screen} – ${APP_NAME}` as const
} as const;

export const nav = {
	log: 'Logga',
	status: 'Status',
	stats: 'Statistik',
	settings: 'Inställningar'
} as const;

export const log = {
	subtitle: 'Daglig logg',
	recentHeading: 'Senaste händelser',
	empty: 'Inget loggat ännu.',
	/** Sits under a row that has been tried and could not get through. */
	waitingRow: '⏳ väntar på signal',
	/** Sits under a row the server refused, in place of its details. */
	failedRow: (reason: string) => `⚠️ ${reason}` as const,
	/** When the server refused without saying why. */
	sendFailed: 'Kunde inte sparas.',
	dismissFailed: 'Ta bort',
	waitingBanner: (count: number) =>
		`⏳ ${count} ${count === 1 ? 'händelse väntar' : 'händelser väntar'} på signal – de skickas automatiskt.` as const,
	dialog: {
		ariaLabel: (activity: string) => `Logga ${activity.toLowerCase()}` as const,
		time: 'Tidpunkt',
		note: 'Anteckning',
		cancel: 'Avbryt',
		save: 'Spara',
		fewer: (field: string) => `Färre ${field.toLowerCase()}` as const,
		more: (field: string) => `Fler ${field.toLowerCase()}` as const
	}
} as const;

export const status = {
	title: nav.status,
	noIntervals: 'Inga aktiviteter har något intervall. Sätt intervall under Inställningar.',
	lastLoggedHeading: 'Senast loggat',
	neverLogged: 'Aldrig loggat',
	/** In the compact list, where the card's fuller wording would not fit. */
	never: 'aldrig',
	overdue: (duration: string) => `${duration} försenat` as const,
	due: (relative: string) => `dags ${relative}` as const,
	everyNthDay: (days: number) => `var ${days}:e dag` as const,
	lastAndInterval: (relative: string, interval: string) => `${relative} · ${interval}` as const
} as const;

export const settings = {
	title: nav.settings,
	saved: 'Sparat!',
	intervalsHeading: 'Intervall',
	intervalsHelp: 'Antal dagar mellan varje gång. Lämna tomt för aktiviteter utan fast intervall.',
	days: 'dagar',
	save: 'Spara',
	logout: 'Logga ut'
} as const;

export const login = {
	title: 'Logga in',
	prompt: 'Logga in för att fortsätta.',
	email: 'Mejladress',
	password: 'Lösenord',
	submit: 'Logga in'
} as const;

/** The page the service worker serves when there is nothing cached to show. */
export const offline = {
	title: 'Offline',
	heading: 'Ingen anslutning',
	body: 'Hundkoll kunde inte laddas. Försök igen när du har signal.'
} as const;

/** Shown to the user when something goes wrong, so all of it is Swedish. */
export const errors = {
	noDog: 'Ingen hund hittades. Har seed-SQL:en körts?',
	invalidTime: 'Ogiltig tidpunkt.',
	invalidValue: (field: string) => `Ogiltigt värde för ${field.toLowerCase()}.` as const,
	logFailed: 'Kunde inte logga händelsen.',
	intervalRange: 'Intervall måste vara ett antal dagar (minst 1).',
	saveFailed: 'Kunde inte spara.',
	missingCredentials: 'Fyll i både mejladress och lösenord.',
	invalidCredentials: 'Fel mejladress eller lösenord.',
	loginFailed: 'Inloggningen misslyckades. Försök igen.'
} as const;

/**
 * The words that attach to a number. format.ts decides how the number itself
 * is written; these decide what it is called.
 */
export const units = {
	minutes: (value: string) => `${value} min` as const,
	hours: (value: string) => `${value} tim` as const,
	kilograms: (value: string) => `${value} kg` as const,
	grams: (value: string) => `${value} g` as const,
	percent: (value: number) => `${value} %` as const,
	weekShort: (week: number) => `v.${week}` as const,
	weekLong: (week: number) => `Vecka ${week}` as const,
	justNow: 'nyss',
	/** Stands in for a value that does not exist, rather than a zero. */
	missing: '–',
	approximately: (value: string) => `~${value}` as const,
	/** Singular and plural per unit, for durations spelled out in words. */
	durationNames: {
		year: ['år', 'år'],
		month: ['månad', 'månader'],
		week: ['vecka', 'veckor'],
		day: ['dag', 'dagar'],
		hour: ['timme', 'timmar'],
		minute: ['minut', 'minuter']
	},
	counted: (count: number, [singular, plural]: readonly [string, string]) =>
		`${count} ${count === 1 ? singular : plural}` as const
} as const;

/** What an activity's details are called, on the form and in the log list. */
export const activities = {
	fields: {
		durationMin: 'Längd (minuter)',
		pee: 'Kiss',
		poop: 'Bajs',
		finished: 'Åt upp',
		weightKg: 'Vikt (kg)'
	},
	/** Lower case: these are fragments joined into one line under an event. */
	summary: {
		pee: 'kiss',
		poop: 'bajs',
		finished: 'åt upp',
		notFinished: 'åt inte upp',
		separator: ' · ',
		repeated: (word: string, count: number) => `${word} ×${count}` as const
	}
} as const;

/** Emoji used as labels in their own right, shared across the stats tooltips. */
const symbols = {
	walk: '🚶',
	pee: '🟡',
	poop: '💩',
	finished: '✅',
	notFinished: '❌',
	unknown: '❔'
} as const;

export const stats = {
	title: nav.stats,
	subtitle: (days: number) => `Snitt över de senaste ${days} dagarna.` as const,
	// `as const satisfies`: keeps the literal types, and still fails if a
	// Period has no label.
	periods: { day: 'Dag', week: 'Vecka', month: 'Månad' } as const satisfies Record<Period, string>,
	periodPickerLabel: 'Periodval',
	trendPickerLabel: 'Trendperiod',
	symbols,

	walks: {
		heading: '🚶 Promenader',
		perDay: '🚶 per dag',
		betweenWalks: '⏳ mellan promenader',
		averageLength: '⏱️ snittlängd',
		/** Tooltip for a day with no walks, where the emoji row would be all zeroes. */
		emptyTooltip: 'Promenader',
		between: 'Tid mellan',
		length: 'Längd'
	},

	meals: {
		heading: '🍽️ Mat',
		betweenMeals: '⏳ mellan mål',
		finishRate: '✅ åt upp',
		legendFinished: 'Åt upp',
		legendNotFinished: 'Åt inte upp',
		legendUnknown: 'Okänt',
		emptyTooltip: 'Mål',
		share: 'Andel'
	},

	accidents: {
		heading: '⚠️ Olyckor',
		legendPee: 'Kiss',
		legendPoop: 'Bajs',
		legendUnspecified: 'Ospecificerat',
		perDay: 'per dag',
		perWeek: 'per vecka',
		perMonth: 'per månad',
		/** Why the chart is blank: the selected period has not finished once yet. */
		pending: (period: Period) =>
			period === 'week'
				? ('Veckovyn visas när en hel vecka har spårats.' as const)
				: ('Månadsvyn visas när en hel månad har spårats.' as const)
	},

	weight: {
		heading: '⚖️ Vikt',
		empty: 'Ingen vägning loggad ännu.'
	},

	trends: {
		heading: '📈 Trender',
		comparison: (latest: string, previous: string) => `${latest} jämfört med ${previous}` as const,
		pending: (period: Period) => {
			const noun = period === 'day' ? 'dagar' : period === 'week' ? 'veckor' : 'månader';
			return `Visas när två hela ${noun} har spårats.` as const;
		},
		unchanged: '±0 %',
		change: (direction: 'up' | 'down', percent: number) =>
			`${direction === 'up' ? '↑' : '↓'} ${percent} %` as const,
		metrics: {
			walks: '🚶 Promenader',
			walkGap: '⏳ Mellan promenader',
			walkDuration: '⏱️ Snittlängd',
			mealGap: '⏳ Mellan mål',
			mealFinishRate: '✅ Åt upp',
			accidents: '⚠️ Olyckor'
		}
	}
} as const;
