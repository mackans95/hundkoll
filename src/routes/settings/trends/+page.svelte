<script lang="ts">
	import { enhance } from '$app/forms';
	import * as locale from '$lib/locale';
	import { savedToast } from '$lib/toast.svelte';
	import MoveButtons from '$lib/components/settings/MoveButtons.svelte';
	import SettingsPage from '$lib/components/settings/SettingsPage.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const words = locale.settings.trends;
	const betterOptions = [
		{ value: '', label: words.betterNeither },
		{ value: 'up', label: words.betterUp },
		{ value: 'down', label: words.betterDown }
	];
	// The ✕ matches MoveButtons beside it.
	const ICON_BUTTON =
		'flex size-9 items-center justify-center rounded-lg border border-edge text-ink-label hover:bg-surface-hover';

	// Edited here and sent only by Spara. Re-read from the server after a save,
	// which is what makes it equal again.
	let rows = $derived(
		data.rows.map((row) => ({ ...row, children: row.children.map((child) => ({ ...child })) }))
	);
	const dirty = $derived(JSON.stringify(rows) !== JSON.stringify(data.rows));

	const available = $derived(
		data.options
			.map((group) => ({
				...group,
				options: group.options.filter((option) => !rows.some((row) => row.key === option.key))
			}))
			.filter((group) => group.options.length > 0)
	);
	// The first one still available, so the picker never shows blank; it moves
	// on by itself once that one is added.
	let adding = $derived(available[0]?.options[0]?.key ?? '');

	// ✕ and Lägg till, like MoveButtons, also post by themselves without JS;
	// with it, they only change the list on screen.
	function move(from: number, to: number) {
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
		const option = available.flatMap((group) => group.options).find((o) => o.key === adding);
		if (!option) return;
		rows = [
			...rows,
			{ key: option.key, label: option.rowLabel, better: '', children: option.children }
		];
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
							<MoveButtons
								index={i}
								count={rows.length}
								label={row.label}
								onmove={move}
							/>
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
						<!-- What the field revealed: compared beneath it on Trender when ticked. -->
						{#if row.children.length > 0}
							<div class="flex flex-col gap-1 border-l-2 border-edge pl-3">
								{#each row.children as child (child.name)}
									<label class="flex items-center gap-2 text-sm">
										<input
											type="checkbox"
											name="children:{row.key}"
											value={child.name}
											bind:checked={child.on}
											class="size-5 rounded border-edge-strong text-emerald-600"
										/>
										{child.label}
									</label>
								{/each}
							</div>
						{/if}
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
