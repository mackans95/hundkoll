// The theme choice. Device-local on purpose — one phone can run dark while
// the other runs light — so it lives in localStorage, not in the database.
// app.html applies the stored choice to <html> before first paint; this
// module is how the settings page reads and changes it afterwards.

export type ThemeChoice = 'system' | 'light' | 'dark';

const KEY = 'hundkoll:theme';

// What the browser chrome (status bar) should show per theme. The light
// value is the brand green the app has always used; the dark value is the
// page surface. Mirrored from the static metas in app.html.
const THEME_COLOR = { light: '#059669', dark: '#0b0f1a' } as const;

export const theme = $state<{ choice: ThemeChoice }>({ choice: 'system' });

/** Reads the stored choice into state and lines up the theme-color metas. */
export function loadTheme(): void {
	let stored: string | null = null;
	try {
		stored = localStorage.getItem(KEY);
	} catch {
		// Storage denied: the choice simply resets to System each launch.
	}
	theme.choice = stored === 'light' || stored === 'dark' ? stored : 'system';
	applyThemeColorMeta(theme.choice);
	// In System mode the status bar has to follow the device when it flips
	// between light and dark while the app is open.
	matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
		if (theme.choice === 'system') applyThemeColorMeta('system');
	});
}

export function setTheme(choice: ThemeChoice): void {
	theme.choice = choice;
	try {
		if (choice === 'system') {
			localStorage.removeItem(KEY);
		} else {
			localStorage.setItem(KEY, choice);
		}
	} catch {
		// Still applied below — it just won't survive a reload.
	}
	if (choice === 'system') {
		delete document.documentElement.dataset.theme;
	} else {
		document.documentElement.dataset.theme = choice;
	}
	applyThemeColorMeta(choice);
}

/**
 * Sets both theme-color metas to the effective scheme's color. The metas'
 * media gating is only a first-paint hint — iOS reads just the first meta
 * and ignores the media attribute, so the real value is always written from
 * here: the explicit choice, or the device preference in System mode.
 */
function applyThemeColorMeta(choice: ThemeChoice): void {
	const effective =
		choice === 'system'
			? matchMedia('(prefers-color-scheme: dark)').matches
				? 'dark'
				: 'light'
			: choice;
	document
		.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
		.forEach((meta) => (meta.content = THEME_COLOR[effective]));
}
