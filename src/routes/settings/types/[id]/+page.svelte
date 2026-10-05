<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import * as locale from '$lib/locale';
	import ColorPicker from '$lib/components/settings/ColorPicker.svelte';
	import IntervalField from '$lib/components/settings/IntervalField.svelte';
	import SettingsPage from '$lib/components/settings/SettingsPage.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const words = locale.settings.type;
	const title = $derived(
		data.type ? `${data.type.icon ?? ''} ${data.type.label}`.trim() : locale.settings.pages.types
	);
</script>

{#snippet heading(text: string)}
	<h2 class="px-1 text-sm font-semibold tracking-wide text-ink-muted uppercase">{text}</h2>
{/snippet}

<SettingsPage {title}>
	<a
		href={resolve('/settings/types')}
		class="-mt-4 px-1 text-sm text-ink-muted underline">‹ {words.back}</a
	>

	{#if data.saved}
		<p class="rounded-lg bg-success-surface p-4 text-success-ink">{locale.settings.saved}</p>
	{/if}
	{#if form?.message}
		<p class="rounded-lg bg-danger-surface p-4 text-danger-ink">{form.message}</p>
	{/if}

	{#if data.failed || !data.type}
		<p class="rounded-lg bg-danger-surface p-4 text-danger-ink">{locale.settings.loadFailed}</p>
	{:else}
		<form
			method="POST"
			action="?/save"
			use:enhance
			class="flex flex-col gap-6"
		>
			<section class="flex flex-col gap-2">
				{@render heading(words.interval)}
				<p class="px-1 text-sm text-ink-muted">{locale.settings.intervalsHelp}</p>
				<IntervalField type={data.type} />
			</section>

			<section class="flex flex-col gap-2">
				{@render heading(words.chartColor)}
				{#if data.palette.length > 0}
					<p class="px-1 text-sm text-ink-muted">{words.chartColorHelp}</p>
					<ColorPicker
						palette={data.palette}
						current={data.settings.chartColor}
						label={words.chartColor}
					/>
				{:else}
					<p class="px-1 text-sm text-ink-muted">{words.noChart}</p>
				{/if}
			</section>

			<!-- Stubs until plans 27–29 add these choices. -->
			<section class="flex flex-col gap-2">
				{@render heading(words.stats)}
				<p class="px-1 text-sm text-ink-muted">{words.statsStub}</p>
			</section>
			<section class="flex flex-col gap-2">
				{@render heading(words.trends)}
				<p class="px-1 text-sm text-ink-muted">{words.trendsStub}</p>
			</section>

			<button
				type="submit"
				class="btn btn-primary">{locale.settings.save}</button
			>
		</form>
	{/if}
</SettingsPage>
