<script lang="ts">
	import { enhance } from '$app/forms';
	import * as locale from '$lib/locale';
	import { isDaily } from '$lib/status/schedule';
	import type { ActionData, PageData } from './$types';
	import IntervalSection from '$lib/components/settings/IntervalSection.svelte';
	import SettingsPage from '$lib/components/settings/SettingsPage.svelte';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const daily = $derived(data.types.filter(isDaily));
	const recurring = $derived(data.types.filter((type) => !isDaily(type)));
</script>

<SettingsPage title={locale.settings.pages.intervals}>
	{#if data.saved}
		<p class="rounded-lg bg-success-surface p-4 text-success-ink">{locale.settings.saved}</p>
	{/if}
	{#if form?.message}
		<p class="rounded-lg bg-danger-surface p-4 text-danger-ink">{form.message}</p>
	{/if}
	{#if data.typesFailed}
		<p class="rounded-lg bg-danger-surface p-4 text-danger-ink">{locale.settings.loadFailed}</p>
	{/if}

	<section class="flex flex-col gap-2">
		<p class="px-1 text-sm text-ink-muted">{locale.settings.intervalsHelp}</p>
		<form
			method="POST"
			action="?/save"
			use:enhance
			class="flex flex-col gap-2"
		>
			<IntervalSection
				kind="daily"
				types={daily}
			/>
			<IntervalSection
				kind="recurring"
				types={recurring}
			/>
			<button
				type="submit"
				class="mt-2 btn btn-primary">{locale.settings.save}</button
			>
		</form>
	</section>
</SettingsPage>
