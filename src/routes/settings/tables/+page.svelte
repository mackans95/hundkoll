<script lang="ts">
	import { enhance } from '$app/forms';
	import * as locale from '$lib/locale';
	import { savedToast } from '$lib/toast.svelte';
	import MoveButtons from '$lib/components/settings/MoveButtons.svelte';
	import SettingsPage from '$lib/components/settings/SettingsPage.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const words = locale.settings.tables;

	// Edited here and sent only by Spara, as on Settings → Trender.
	let cards = $derived(data.cards.map((card) => ({ ...card })));
	const dirty = $derived(JSON.stringify(cards) !== JSON.stringify(data.cards));

	function move(from: number, to: number) {
		const next = [...cards];
		[next[from], next[to]] = [next[to], next[from]];
		cards = next;
	}
</script>

<SettingsPage title={locale.settings.pages.tables}>
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
				{#each cards as card, i (card.type)}
					<div
						class="flex items-center gap-2 rounded-2xl border border-edge bg-surface-raised px-4 py-3"
					>
						<input
							type="hidden"
							name="card"
							value={card.type}
						/>
						<label class="flex min-w-0 flex-1 items-center gap-3">
							<input
								type="checkbox"
								name="shown"
								value={card.type}
								bind:checked={card.shown}
								aria-label={`${words.show}: ${card.label}`}
								class="size-6 rounded border-edge-strong text-emerald-600"
							/>
							<span class="font-medium {card.shown ? '' : 'text-ink-muted'}">{card.label}</span>
						</label>
						<MoveButtons
							index={i}
							count={cards.length}
							label={card.label}
							onmove={move}
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
</SettingsPage>
