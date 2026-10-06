<script lang="ts">
	import { enhance } from '$app/forms';
	import * as locale from '$lib/locale';
	import { savedToast } from '$lib/toast.svelte';
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

	// Edited here and sent only by Spara. Re-read from the server after a save,
	// which is what makes it equal again.
	let rows = $derived(data.rows.map((row) => ({ ...row })));
	const dirty = $derived(JSON.stringify(rows) !== JSON.stringify(data.rows));

	const available = $derived(
		data.options
			.map((group) => ({
				...group,
				options: group.options.filter((option) => !rows.some((row) => row.key === option.key))
			}))
			.filter((group) => group.options.length > 0)
	);
	let adding = $state('');

	// Each edit button also posts by itself, so the page works without JS;
	// with it, the button only changes the list on screen.
	function move(event: MouseEvent, from: number, to: number) {
		event.preventDefault();
		const next = [...rows];
		[next[from], next[to]] = [next[to], next[from]];
		rows = next;
	}

	function remove(event: MouseEvent, at: number) {
		event.preventDefault();
		rows = rows.filter((_, i) => i !== at);
	}

	function add(event: MouseEvent) {
		event.preventDefault();
		const key = adding || available[0]?.options[0]?.key;
		const option = available.flatMap((group) => group.options).find((o) => o.key === key);
		if (!option) return;
		rows = [...rows, { key: option.key, label: option.rowLabel, better: '' }];
		adding = '';
	}
</script>

<SettingsPage title={locale.settings.pages.trends}>
	{#if form && 'message' in form && form.message}
		<p class="rounded-lg bg-danger-surface p-4 text-danger-ink">{form.message}</p>
	{/if}
	<!-- With JS the save is a toast; without it, the page reloads onto this. -->
	<noscript>
		{#if form && 'saved' in form}
			<p class="rounded-lg bg-success-surface p-4 text-success-ink">{locale.settings.saved}</p>
		{/if}
	</noscript>

	{#if data.failed}
		<p class="rounded-lg bg-danger-surface p-4 text-danger-ink">{locale.settings.loadFailed}</p>
	{:else}
		<p class="px-1 text-sm text-ink-muted">{words.help}</p>

		<form
			method="POST"
			action="?/save"
			use:enhance={savedToast}
			class="flex flex-col gap-6"
		>
			<div class="flex flex-col gap-2">
				{#each rows as row, i (row.key)}
					<div
						class="flex flex-col gap-2 rounded-2xl border border-edge bg-surface-raised px-4 py-3"
					>
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
								onclick={(event) => move(event, i, i - 1)}
								aria-label={`${words.up}: ${row.label}`}>▲</button
							>
							<button
								type="submit"
								name="op"
								value="down:{i}"
								class={ICON_BUTTON}
								disabled={i === rows.length - 1}
								onclick={(event) => move(event, i, i + 1)}
								aria-label={`${words.down}: ${row.label}`}>▼</button
							>
							<button
								type="submit"
								name="op"
								value="remove:{i}"
								class={ICON_BUTTON}
								onclick={(event) => remove(event, i)}
								aria-label={`${words.remove}: ${row.label}`}>✕</button
							>
						</div>
						<label class="flex items-center gap-2 text-sm text-ink-muted">
							{words.better}
							<select
								name="better"
								bind:value={row.better}
								class="rounded-lg border-edge-strong py-1 text-sm"
							>
								{#each betterOptions as option (option.value)}
									<option value={option.value}>{option.label}</option>
								{/each}
							</select>
						</label>
					</div>
				{:else}
					<p class="px-1 text-sm text-ink-muted">{words.empty}</p>
				{/each}
			</div>

			<section class="flex flex-col gap-2">
				<h3 class="px-1 text-sm font-semibold tracking-wide text-ink-muted uppercase">
					{words.add}
				</h3>
				{#if available.length > 0}
					<div class="flex items-center gap-2">
						<select
							name="add"
							bind:value={adding}
							aria-label={words.add}
							class="min-w-0 flex-1 rounded-lg border-edge-strong text-sm"
						>
							{#each available as group (group.label)}
								<optgroup label={group.label}>
									{#each group.options as option (option.key)}
										<option value={option.key}>{option.label}</option>
									{/each}
								</optgroup>
							{/each}
						</select>
						<button
							type="submit"
							name="op"
							value="add"
							class="btn btn-secondary"
							onclick={add}>{words.addButton}</button
						>
					</div>
				{:else}
					<p class="px-1 text-sm text-ink-muted">{words.allAdded}</p>
				{/if}
			</section>

			<div class="flex flex-col gap-1">
				<button
					type="submit"
					class="btn btn-primary">{locale.settings.save}</button
				>
				{#if dirty}
					<p class="px-1 text-center text-sm text-ink-muted">{words.unsaved}</p>
				{/if}
			</div>
		</form>
	{/if}
</SettingsPage>
