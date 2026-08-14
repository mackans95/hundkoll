<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { DETAIL_FIELDS } from '$lib/events';
	import { enqueue } from '$lib/offline-queue.svelte';
	import { stockholmInputToUtc } from '$lib/time';

	type EventType = { id: string; label: string; icon: string | null };

	let {
		type,
		nowLocal,
		eventId,
		message,
		onClose
	}: {
		type: EventType;
		nowLocal: string;
		eventId: string;
		message: string | null;
		/** Set when the dialog was opened client-side (offline). */
		onClose?: () => void;
	} = $props();

	const fields = $derived(DETAIL_FIELDS[type.id] ?? []);

	async function queue(formData: FormData) {
		const values: Record<string, string> = {};
		for (const [name, value] of formData.entries()) {
			if (typeof value === 'string') values[name] = value;
		}
		const occurred = stockholmInputToUtc(values.occurred_at ?? '') ?? new Date();
		await enqueue({
			id: values.event_id,
			typeId: type.id,
			label: type.label,
			icon: type.icon,
			occurredAt: occurred.toISOString(),
			fields: values,
			attempts: 0
		});

		if (onClose) {
			onClose();
		} else {
			// This dialog came from ?detail=… — the signal dropped after it
			// opened. A full navigation closes it, and the service worker
			// answers it from cache.
			location.href = '/';
		}
	}

	// Offline, the submission is kept on the phone instead of failing: the
	// row id already travels with the form, so sending it later cannot
	// duplicate the event.
	const submit: SubmitFunction = ({ formData, cancel }) => {
		if (!navigator.onLine) {
			cancel();
			queue(formData);
			return;
		}
		return async ({ result, update }) => {
			if (result.type === 'error') {
				await queue(formData);
				return;
			}
			await update();
		};
	};

	// Checked count fields and their stepper values; a missing key means the
	// checkbox is unchecked. Fresh per dialog open (the page keys this
	// component on the type id).
	let counts = $state<Record<string, number>>({});

	function toggleCount(name: string, checked: boolean) {
		if (checked) {
			counts[name] = counts[name] ?? 1;
		} else {
			delete counts[name];
		}
	}
</script>

<!-- Server-rendered dialog: opened by ?detail=<id>, closed by a plain link
     back to "/", so it works without JavaScript. -->
<div class="fixed inset-0 z-30 flex items-end justify-center bg-black/40 sm:items-center">
	<div
		role="dialog"
		aria-modal="true"
		aria-label="Logga {type.label.toLowerCase()}"
		class="w-full max-w-sm rounded-t-2xl bg-white p-6 shadow-xl sm:rounded-2xl"
	>
		<h2 class="mb-4 text-xl font-bold">{type.icon} {type.label}</h2>

		{#if message}
			<p class="mb-3 rounded-lg bg-red-50 p-3 text-red-800">{message}</p>
		{/if}

		<form method="POST" action="?/log" use:enhance={submit} class="flex flex-col gap-3">
			<input type="hidden" name="type_id" value={type.id} />
			<input type="hidden" name="detailed" value="1" />
			<input type="hidden" name="event_id" value={eventId} />

			<label class="flex flex-col gap-1">
				<span class="text-sm font-medium text-gray-700">Tidpunkt</span>
				<input
					type="datetime-local"
					name="occurred_at"
					value={nowLocal}
					max={nowLocal}
					required
					class="rounded-lg border-gray-300"
				/>
			</label>

			{#each fields as field (field.name)}
				{#if field.input === 'count'}
					<div class="flex min-h-11 items-center justify-between">
						<label class="flex items-center gap-2">
							<input
								type="checkbox"
								name={field.name}
								checked={field.name in counts}
								onchange={(e) => toggleCount(field.name, e.currentTarget.checked)}
								class="rounded border-gray-300"
							/>
							<span class="text-sm font-medium text-gray-700">{field.label}</span>
						</label>
						{#if field.name in counts}
							<div class="flex items-center gap-3">
								<button
									type="button"
									aria-label="Färre {field.label.toLowerCase()}"
									onclick={() => (counts[field.name] = Math.max(1, counts[field.name] - 1))}
									class="h-9 w-9 rounded-full border border-gray-300 text-lg leading-none transition-colors hover:bg-gray-100 active:bg-gray-100"
								>
									−
								</button>
								<span class="w-4 text-center font-semibold">{counts[field.name]}</span>
								<button
									type="button"
									aria-label="Fler {field.label.toLowerCase()}"
									onclick={() => (counts[field.name] += 1)}
									class="h-9 w-9 rounded-full border border-gray-300 text-lg leading-none transition-colors hover:bg-gray-100 active:bg-gray-100"
								>
									+
								</button>
								<input type="hidden" name="{field.name}_count" value={counts[field.name]} />
							</div>
						{/if}
					</div>
				{:else if field.input === 'checkbox'}
					<label class="flex min-h-11 items-center gap-2">
						<input type="checkbox" name={field.name} class="rounded border-gray-300" />
						<span class="text-sm font-medium text-gray-700">{field.label}</span>
					</label>
				{:else}
					<label class="flex flex-col gap-1">
						<span class="text-sm font-medium text-gray-700">{field.label}</span>
						<input
							type="number"
							name={field.name}
							inputmode="decimal"
							step={field.step ?? '1'}
							min="0"
							required={field.required ?? false}
							class="rounded-lg border-gray-300"
						/>
					</label>
				{/if}
			{/each}

			<label class="flex flex-col gap-1">
				<span class="text-sm font-medium text-gray-700">Anteckning</span>
				<textarea name="note" rows="2" class="rounded-lg border-gray-300"></textarea>
			</label>

			<div class="mt-2 flex gap-2">
				{#if onClose}
					<button
						type="button"
						onclick={onClose}
						class="flex-1 rounded-lg border border-gray-300 px-4 py-3 text-center font-semibold text-gray-700 transition-colors hover:bg-gray-50"
					>
						Avbryt
					</button>
				{:else}
					<a
						href="/"
						class="flex-1 rounded-lg border border-gray-300 px-4 py-3 text-center font-semibold text-gray-700 transition-colors hover:bg-gray-50"
					>
						Avbryt
					</a>
				{/if}
				<button
					type="submit"
					class="flex-1 rounded-lg bg-gray-900 px-4 py-3 font-semibold text-white transition-colors hover:bg-gray-800 active:bg-gray-700"
				>
					Spara
				</button>
			</div>
		</form>
	</div>
</div>
