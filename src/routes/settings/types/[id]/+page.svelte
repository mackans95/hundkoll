<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import * as locale from '$lib/locale';
	import { savedToastThen } from '$lib/toast.svelte';
	import ColorPicker from '$lib/components/settings/ColorPicker.svelte';
	import IntervalField from '$lib/components/settings/IntervalField.svelte';
	import TileEditor from '$lib/components/settings/TileEditor.svelte';
	import SettingsPage from '$lib/components/settings/SettingsPage.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// Any field touched, or the tile list edited on screen, until a save succeeds.
	let dirty = $state(false);
	const markDirty = () => (dirty = true);
	const save = savedToastThen(() => (dirty = false));

	const words = locale.settings.type;
	// No icon here: it is on the type's row in the list, and pushes the title out of line.
	const title = $derived(data.type?.label ?? locale.settings.pages.types);
</script>

{#snippet heading(text: string)}
	<h3 class="px-1 text-sm font-semibold tracking-wide text-ink-muted uppercase">{text}</h3>
{/snippet}

<SettingsPage {title}>
	<a
		href={resolve('/settings/types')}
		class="-mt-4 px-1 text-sm text-ink-muted underline">‹ {words.back}</a
	>

	<!-- With JS the save is a toast; without it, the page reloads onto this. -->
	<noscript>
		{#if form && 'saved' in form}
			<p class="rounded-lg bg-success-surface p-4 text-success-ink">{locale.settings.saved}</p>
		{/if}
	</noscript>
	{#if form && 'message' in form && form.message}
		<p class="rounded-lg bg-danger-surface p-4 text-danger-ink">{form.message}</p>
	{/if}

	{#if data.failed || !data.type}
		<p class="rounded-lg bg-danger-surface p-4 text-danger-ink">{locale.settings.loadFailed}</p>
	{:else}
		<form
			method="POST"
			action="?/save"
			use:enhance={save}
			oninput={markDirty}
			onchange={markDirty}
			class="flex flex-col gap-6"
		>
			<!-- First, so Enter in the interval field saves the page rather than
			     pressing the first ▲ ▼ of the tile list below. -->
			<button
				type="submit"
				class="sr-only"
				tabindex="-1"
				aria-hidden="true">{locale.settings.save}</button
			>
			<section class="flex flex-col gap-2">
				{@render heading(words.interval)}
				<p class="px-1 text-sm text-ink-muted">{locale.settings.intervalsHelp}</p>
				<IntervalField type={data.type} />
			</section>

			{#if data.statusOption || data.statsOption}
				<section class="flex flex-col gap-2">
					{@render heading(words.shownOn)}
					<!-- An unticked box posts nothing; each hidden "false" says its field was there. -->
					<div
						class="flex flex-col divide-y divide-edge-soft rounded-2xl border border-edge bg-surface-raised"
					>
						{#if data.statusOption}
							<label class="flex items-center justify-between gap-3 px-4 py-3">
								<span class="font-medium">{words.showOnStatus}</span>
								<input
									type="hidden"
									name="show_on_status"
									value="false"
								/>
								<input
									type="checkbox"
									name="show_on_status"
									value="true"
									checked={data.settings.showOnStatus}
									class="size-6 rounded border-edge-strong text-emerald-600"
								/>
							</label>
						{/if}
						{#if data.statsOption}
							<label class="flex items-center justify-between gap-3 px-4 py-3">
								<span class="font-medium">{words.showOnStats}</span>
								<input
									type="hidden"
									name="show_on_stats"
									value="false"
								/>
								<input
									type="checkbox"
									name="show_on_stats"
									value="true"
									checked={data.showOnStats}
									class="size-6 rounded border-edge-strong text-emerald-600"
								/>
							</label>
						{/if}
					</div>
					{#if data.statusOption}
						<p class="px-1 text-sm text-ink-muted">{words.showOnStatusHelp}</p>
					{/if}
				</section>
			{/if}

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

			{#if data.tileOptions.length > 0}
				<section class="flex flex-col gap-2">
					{@render heading(words.stats)}
					<p class="px-1 text-sm text-ink-muted">{words.tilesHelp}</p>
					<TileEditor
						tiles={data.tiles}
						options={data.tileOptions}
						onedit={markDirty}
					/>
				</section>
			{/if}
			<section class="flex flex-col gap-2">
				{@render heading(words.trends)}
				<p class="px-1 text-sm text-ink-muted">{words.trendsHelp}</p>
				<!-- Says the switches were on the page, since an unticked box posts nothing. -->
				<input
					type="hidden"
					name="trends_present"
					value="1"
				/>
				<div
					class="flex flex-col divide-y divide-edge-soft rounded-2xl border border-edge bg-surface-raised"
				>
					{#each data.trends as trend (trend.key)}
						<label class="flex items-center justify-between gap-3 px-4 py-3">
							<span class="font-medium">{trend.label}</span>
							<input
								type="checkbox"
								name="trend"
								value={trend.key}
								checked={trend.on}
								class="size-6 rounded border-edge-strong text-emerald-600"
							/>
						</label>
					{/each}
				</div>
			</section>

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
</SettingsPage>
