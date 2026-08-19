<script lang="ts">
	import { enhance } from '$app/forms';
	import * as locale from '$lib/locale';
	import { setTheme, theme, type ThemeChoice } from '$lib/theme.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const themeChoices: { value: ThemeChoice; label: string }[] = [
		{ value: 'system', label: locale.settings.theme.system },
		{ value: 'light', label: locale.settings.theme.light },
		{ value: 'dark', label: locale.settings.theme.dark }
	];
</script>

<svelte:head><title>{locale.app.pageTitle(locale.settings.title)}</title></svelte:head>

<main class="mx-auto flex min-h-dvh max-w-sm flex-col gap-6 p-4">
	<header class="px-1">
		<h1 class="text-3xl font-bold">{locale.settings.title}</h1>
	</header>

	{#if data.saved}
		<p class="rounded-lg bg-success-surface p-4 text-success-ink">{locale.settings.saved}</p>
	{/if}
	{#if form?.message}
		<p class="rounded-lg bg-danger-surface p-4 text-danger-ink">{form.message}</p>
	{/if}

	<section class="flex flex-col gap-2">
		<h2 class="px-1 text-sm font-semibold tracking-wide text-ink-muted uppercase">
			{locale.settings.intervalsHeading}
		</h2>
		<p class="px-1 text-sm text-ink-muted">{locale.settings.intervalsHelp}</p>
		<form
			method="POST"
			action="?/save"
			use:enhance
			class="flex flex-col gap-2"
		>
			{#each data.types as type (type.id)}
				<label
					class="flex items-center justify-between gap-3 rounded-2xl border border-edge bg-surface-raised px-4 py-3"
				>
					<span class="font-medium">{type.icon} {type.label}</span>
					<span class="flex items-center gap-2">
						<input
							type="number"
							name="interval_{type.id}"
							value={type.interval_days ?? ''}
							min="1"
							inputmode="numeric"
							class="w-20 rounded-lg border-edge-strong text-right"
						/>
						<span class="text-sm text-ink-muted">{locale.settings.days}</span>
					</span>
				</label>
			{/each}
			<button
				type="submit"
				class="mt-2 btn btn-primary">{locale.settings.save}</button
			>
		</form>
	</section>

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

	<section class="mt-auto flex flex-col gap-2">
		<form
			method="POST"
			action="?/logout"
			use:enhance
		>
			<button
				type="submit"
				class="w-full btn btn-secondary">{locale.settings.logout}</button
			>
		</form>
	</section>
</main>
