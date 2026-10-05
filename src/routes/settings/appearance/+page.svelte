<script lang="ts">
	import * as locale from '$lib/locale';
	import { setTheme, theme, type ThemeChoice } from '$lib/theme.svelte';
	import SettingsPage from '$lib/components/settings/SettingsPage.svelte';

	const themeChoices: { value: ThemeChoice; label: string }[] = [
		{ value: 'system', label: locale.settings.theme.system },
		{ value: 'light', label: locale.settings.theme.light },
		{ value: 'dark', label: locale.settings.theme.dark }
	];
</script>

<SettingsPage title={locale.settings.pages.appearance}>
	<section class="flex flex-col gap-2">
		<h2 class="px-1 text-sm font-semibold tracking-wide text-ink-muted uppercase">
			{locale.settings.theme.heading}
		</h2>
		<!-- Buttons, not links: the choice is device-local (localStorage), so
		     there is nothing for the server to render. Looks like TabBar. -->
		<div
			role="radiogroup"
			aria-label={locale.settings.theme.heading}
			class="flex rounded-lg bg-surface-hover p-1"
		>
			{#each themeChoices as choice (choice.value)}
				<button
					type="button"
					role="radio"
					aria-checked={theme.choice === choice.value}
					onclick={() => setTheme(choice.value)}
					class="flex-1 rounded-md py-1.5 text-center text-sm font-medium {theme.choice ===
					choice.value
						? 'bg-surface-raised text-ink shadow-sm'
						: 'text-ink-muted hover:text-ink'}"
				>
					{choice.label}
				</button>
			{/each}
		</div>
	</section>
</SettingsPage>
