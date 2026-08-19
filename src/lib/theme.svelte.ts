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
 * The two theme-color metas in app.html are media-gated for System mode.
 * An explicit choice overrides the media query in CSS but not in the metas,
 * so for explicit modes both metas get that mode's color; System restores
 * the originals.
 */
function applyThemeColorMeta(choice: ThemeChoice): void {
	const metas = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]');
	metas.forEach((meta) => {
		const scheme = meta.media.includes('dark') ? 'dark' : 'light';
		meta.content = THEME_COLOR[choice === 'system' ? scheme : choice];
	});
}
