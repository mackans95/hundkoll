<script lang="ts">
	import { enhance } from '$app/forms';
	import * as locale from '$lib/locale';
	import { setTheme, theme, type ThemeChoice } from '$lib/theme.svelte';
	import { savedToastThen } from '$lib/toast.svelte';
	import ColorPicker from '$lib/components/settings/ColorPicker.svelte';
	import SettingsPage from '$lib/components/settings/SettingsPage.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let dirty = $state(false);
	const save = savedToastThen(() => (dirty = false));

	const themeChoices: { value: ThemeChoice; label: string }[] = [
		{ value: 'system', label: locale.settings.theme.system },
		{ value: 'light', label: locale.settings.theme.light },
		{ value: 'dark', label: locale.settings.theme.dark }
	];
	const words = locale.settings.colors;
</script>

{#snippet heading(text: string)}
	<h3 class="px-1 text-sm font-semibold tracking-wide text-ink-muted uppercase">{text}</h3>
{/snippet}

<SettingsPage title={locale.settings.pages.appearance}>
	<section class="flex flex-col gap-2">
		{@render heading(locale.settings.theme.heading)}
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

	<!-- With JS the save is a toast; without it, the page reloads onto this. -->
	<noscript>
		{#if form && 'saved' in form}
			<p class="rounded-lg bg-success-surface p-4 text-success-ink">{locale.settings.saved}</p>
		{/if}
	</noscript>
	{#if form && 'message' in form && form.message}
		<p class="rounded-lg bg-danger-surface p-4 text-danger-ink">{form.message}</p>
	{/if}

	<section class="flex flex-col gap-2">
		{@render heading(words.heading)}
		{#if data.failed}
			<p class="rounded-lg bg-danger-surface p-4 text-danger-ink">{locale.settings.loadFailed}</p>
		{:else}
			<p class="px-1 text-sm text-ink-muted">{words.help}</p>
			<form
				method="POST"
				action="?/save"
				use:enhance={save}
				onchange={() => (dirty = true)}
				class="flex flex-col gap-4"
			>
				<div
					class="flex flex-col divide-y divide-edge-soft rounded-2xl border border-edge bg-surface-raised"
				>
					{#each data.colors as type (type.id)}
						<div class="flex flex-col gap-1 px-2 py-3">
							<span class="px-1 font-medium">{type.icon} {type.label}</span>
							<ColorPicker
								palette={type.palette}
								current={type.current}
								label={words.label(type.label)}
								name="chart_color:{type.id}"
							/>
						</div>
					{/each}
				</div>
				<div class="flex flex-col gap-1">
					<button
						type="submit"
						class="btn btn-primary">{locale.settings.save}</button
					>
					{#if dirty}
						<p class="px-1 text-center text-sm text-ink-muted">{locale.settings.trends.unsaved}</p>
					{/if}
				</div>
			</form>
		{/if}
	</section>
</SettingsPage>
