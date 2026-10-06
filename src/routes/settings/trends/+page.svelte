<script lang="ts">
	import { enhance } from '$app/forms';
	import * as locale from '$lib/locale';
	import SettingsPage from '$lib/components/settings/SettingsPage.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const words = locale.settings.trends;
	const betterOptions = [
		{ value: '', label: words.betterNeither },
		{ value: 'up', label: words.betterUp },
		{ value: 'down', label: words.betterDown }
	];
	// Small square buttons: their names are for a screen reader, the glyphs for the eye.
	const ICON_BUTTON =
		'flex size-9 items-center justify-center rounded-lg border border-edge text-ink-label hover:bg-surface-hover disabled:opacity-30';
</script>

<SettingsPage title={locale.settings.pages.trends}>
	{#if data.saved}
		<p class="rounded-lg bg-success-surface p-4 text-success-ink">{locale.settings.saved}</p>
	{/if}
	{#if form?.message}
		<p class="rounded-lg bg-danger-surface p-4 text-danger-ink">{form.message}</p>
	{/if}

	{#if data.failed}
		<p class="rounded-lg bg-danger-surface p-4 text-danger-ink">{locale.settings.loadFailed}</p>
	{:else}
		<p class="px-1 text-sm text-ink-muted">{words.help}</p>

		<!-- One form: every button posts the whole list, so a direction changed
		     beside it is kept whichever button saves. -->
		<form
			method="POST"
			action="?/save"
			use:enhance
			class="flex flex-col gap-2"
		>
			{#each data.rows as row, i (row.key)}
				<div class="flex flex-col gap-2 rounded-2xl border border-edge bg-surface-raised px-4 py-3">
					<input
						type="hidden"
						name="key"
						value={row.key}
					/>
					<div class="flex items-center gap-2">
						<span class="min-w-0 flex-1 font-medium">{row.label}</span>
						<button
							type="submit"
							name="op"
							value="up:{i}"
							class={ICON_BUTTON}
							disabled={i === 0}
							aria-label={`${words.up}: ${row.label}`}>▲</button
						>
						<button
							type="submit"
							name="op"
							value="down:{i}"
							class={ICON_BUTTON}
							disabled={i === data.rows.length - 1}
							aria-label={`${words.down}: ${row.label}`}>▼</button
						>
						<button
							type="submit"
							name="op"
							value="remove:{i}"
							class={ICON_BUTTON}
							aria-label={`${words.remove}: ${row.label}`}>✕</button
						>
					</div>
					<label class="flex items-center gap-2 text-sm text-ink-muted">
						{words.better}
						<select
							name="better"
							class="rounded-lg border-edge-strong py-1 text-sm"
						>
							{#each betterOptions as option (option.value)}
								<option
									value={option.value}
									selected={(row.better ?? '') === option.value}>{option.label}</option
								>
							{/each}
						</select>
					</label>
				</div>
			{:else}
				<p class="px-1 text-sm text-ink-muted">{words.empty}</p>
			{/each}

			{#if data.rows.length > 0}
				<button
					type="submit"
					class="mt-2 btn btn-primary">{locale.settings.save}</button
				>
			{/if}
		</form>

		<section class="flex flex-col gap-2">
			<h3 class="px-1 text-sm font-semibold tracking-wide text-ink-muted uppercase">
				{words.add}
			</h3>
			{#if data.available.length > 0}
				<form
					method="POST"
					action="?/add"
					use:enhance
					class="flex items-center gap-2"
				>
					<select
						name="key"
						aria-label={words.add}
						class="min-w-0 flex-1 rounded-lg border-edge-strong text-sm"
					>
						{#each data.available as group (group.label)}
							<optgroup label={group.label}>
								{#each group.options as option (option.key)}
									<option value={option.key}>{option.label}</option>
								{/each}
							</optgroup>
						{/each}
					</select>
					<button
						type="submit"
						class="btn btn-primary">{words.addButton}</button
					>
				</form>
			{:else}
				<p class="px-1 text-sm text-ink-muted">{words.allAdded}</p>
			{/if}
		</section>
	{/if}
</SettingsPage>
