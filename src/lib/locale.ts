// Every word the app shows, in one place.
//
// Swedish in the UI, English in the code — so this is where the two meet.
// There is one language and no plan for a second, so nothing here is keyed by
// locale or loaded at runtime; it is a plain module the compiler checks.
//
// Anything with a value in it is a function rather than a template with
// placeholders, so the grammar around the value stays next to the words.
// Emoji that belong to a label travel with it; standalone icons stay in the
// component, where they sit next to the markup they decorate.
//
// Two pieces of user-facing text deliberately live elsewhere: the activity
// names (Promenad, Matning …) are rows in the event_types table, and the
// installed app's name is in static/manifest.webmanifest, which the browser
// reads without going through the bundler.

import type { Period } from '$lib/types/domain';

export const app = {
	name: 'Hundkoll',
	/** Browser tab title. The screen comes first so tabs stay tellable apart. */
	pageTitle: (screen: string) => `${screen} – ${app.name}`
};

export const nav = {
	log: 'Logga',
	status: 'Status',
	stats: 'Statistik',
	settings: 'Inställningar'
};

export const log = {
	subtitle: 'Daglig logg',
	recentHeading: 'Senaste händelser',
	empty: 'Inget loggat ännu.',
	/** Sits under a queued row, in place of its details. */
	waitingRow: '⏳ väntar på signal',
	waitingBanner: (count: number) =>
		`⏳ ${count} ${count === 1 ? 'händelse väntar' : 'händelser väntar'} på signal – de skickas automatiskt.`,
	dialog: {
		ariaLabel: (activity: string) => `Logga ${activity.toLowerCase()}`,
		time: 'Tidpunkt',
		note: 'Anteckning',
		cancel: 'Avbryt',
		save: 'Spara',
		fewer: (field: string) => `Färre ${field.toLowerCase()}`,
		more: (field: string) => `Fler ${field.toLowerCase()}`
	}
};

export const status = {
	title: nav.status,
	noIntervals: 'Inga aktiviteter har något intervall. Sätt intervall under Inställningar.',
	lastLoggedHeading: 'Senast loggat',
	neverLogged: 'Aldrig loggat',
	/** In the compact list, where the card's fuller wording would not fit. */
	never: 'aldrig',
	overdue: (duration: string) => `${duration} försenat`,
	due: (relative: string) => `dags ${relative}`,
	everyNthDay: (days: number | null) => `var ${days}:e dag`,
	lastAndInterval: (relative: string, interval: string) => `${relative} · ${interval}`
};

export const settings = {
	title: nav.settings,
	saved: 'Sparat!',
	intervalsHeading: 'Intervall',
	intervalsHelp: 'Antal dagar mellan varje gång. Lämna tomt för aktiviteter utan fast intervall.',
	days: 'dagar',
	save: 'Spara',
	logout: 'Logga ut'
};

export const login = {
	title: 'Logga in',
	prompt: 'Logga in för att fortsätta.',
	email: 'Mejladress',
	password: 'Lösenord',
	submit: 'Logga in'
};

/** The page the service worker serves when there is nothing cached to show. */
export const offline = {
	title: 'Offline',
	heading: 'Ingen anslutning',
	body: 'Hundkoll kunde inte laddas. Försök igen när du har signal.'
};

/** Shown to the user when something goes wrong, so all of it is Swedish. */
export const errors = {
	noDog: 'Ingen hund hittades. Har seed-SQL:en körts?',
	invalidTime: 'Ogiltig tidpunkt.',
	invalidValue: (field: string) => `Ogiltigt värde för ${field.toLowerCase()}.`,
	logFailed: 'Kunde inte logga händelsen.',
	intervalRange: 'Intervall måste vara ett antal dagar (minst 1).',
	saveFailed: 'Kunde inte spara.',
	missingCredentials: 'Fyll i både mejladress och lösenord.',
	invalidCredentials: 'Fel mejladress eller lösenord.',
	loginFailed: 'Inloggningen misslyckades. Försök igen.'
};

/**
 * The words that attach to a number. format.ts decides how the number itself
 * is written; these decide what it is called.
 */
export const units = {
	minutes: (value: string) => `${value} min`,
	hours: (value: string) => `${value} tim`,
	kilograms: (value: string) => `${value} kg`,
	grams: (value: string) => `${value} g`,
	percent: (value: number) => `${value} %`,
	weekShort: (week: number) => `v.${week}`,
	weekLong: (week: number) => `Vecka ${week}`,
	justNow: 'nyss',
	/** Stands in for a value that does not exist, rather than a zero. */
	missing: '–',
	approximately: (value: string) => `~${value}`,
	/** Singular and plural per unit, for durations spelled out in words. */
	durationNames: {
		year: ['år', 'år'],
		month: ['månad', 'månader'],
		week: ['vecka', 'veckor'],
		day: ['dag', 'dagar'],
		hour: ['timme', 'timmar'],
		minute: ['minut', 'minuter']
	} as Record<string, [singular: string, plural: string]>,
	counted: (count: number, [singular, plural]: [string, string]) =>
		`${count} ${count === 1 ? singular : plural}`
};

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
		repeated: (word: string, count: number) => `${word} ×${count}`
	}
};

/** Emoji used as labels in their own right, shared across the stats tooltips. */
const symbols = {
	walk: '🚶',
	pee: '🟡',
	poop: '💩',
	finished: '✅',
	notFinished: '❌',
	unknown: '❔'
};

export const stats = {
	title: nav.stats,
	subtitle: (days: number) => `Snitt över de senaste ${days} dagarna.`,
	periods: { day: 'Dag', week: 'Vecka', month: 'Månad' } as Record<Period, string>,
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
				? 'Veckovyn visas när en hel vecka har spårats.'
				: 'Månadsvyn visas när en hel månad har spårats.'
	},

	weight: {
		heading: '⚖️ Vikt',
		empty: 'Ingen vägning loggad ännu.'
	},

	trends: {
		heading: '📈 Trender',
		comparison: (latest: string, previous: string) => `${latest} jämfört med ${previous}`,
		pending: (period: Period) => {
			const noun = period === 'day' ? 'dagar' : period === 'week' ? 'veckor' : 'månader';
			return `Visas när två hela ${noun} har spårats.`;
		},
		unchanged: '±0 %',
		change: (direction: 'up' | 'down', percent: number) =>
			`${direction === 'up' ? '↑' : '↓'} ${percent} %`,
		metrics: {
			walks: '🚶 Promenader',
			walkGap: '⏳ Mellan promenader',
			walkDuration: '⏱️ Snittlängd',
			mealGap: '⏳ Mellan mål',
			mealFinishRate: '✅ Åt upp',
			accidents: '⚠️ Olyckor'
		}
	}
};
