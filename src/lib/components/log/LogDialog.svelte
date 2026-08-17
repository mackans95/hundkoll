<script lang="ts">
	import { enhance } from '$app/forms';
	import { fieldsFor } from '$lib/events/fields';
	import * as locale from '$lib/locale';
	import { createLogSubmit } from '$lib/offline/submit';
	import type { EventType } from '$lib/types/domain';
	import DetailFields from './DetailFields.svelte';

	let {
		type,
		nowLocal,
		eventId,
		message,
		onClose
	}: {
		type: Pick<EventType, 'id' | 'label' | 'icon'>;
		nowLocal: string;
		eventId: string;
		message: string | null;
		/** Set when the page opened the dialog itself, which it does offline. */
		onClose?: () => void;
	} = $props();

	const fields = $derived(fieldsFor(type.id));

	// Closing means whatever opening meant. A dialog the page opened is
	// closed by the page; a dialog that came from ?detail= is closed by
	// navigating, which the service worker answers from cache when offline.
	const dismiss = $derived(
		onClose ??
			(() => {
				location.href = '/';
			})
	);
	const submit = $derived(createLogSubmit(type, dismiss));
</script>

<!-- Server-rendered dialog: opened by ?detail=<id>, closed by a plain link
     back to "/", so it works without JavaScript. -->
<div class="fixed inset-0 z-30 flex items-end justify-center bg-black/40 sm:items-center">
	<div
		role="dialog"
		aria-modal="true"
		aria-label={locale.log.dialog.ariaLabel(type.label)}
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
				<span class="text-sm font-medium text-gray-700">{locale.log.dialog.time}</span>
				<input
					type="datetime-local"
					name="occurred_at"
					value={nowLocal}
					max={nowLocal}
					required
					class="rounded-lg border-gray-300"
				/>
			</label>

			<DetailFields {fields} />

			<label class="flex flex-col gap-1">
				<span class="text-sm font-medium text-gray-700">{locale.log.dialog.note}</span>
				<textarea name="note" rows="2" class="rounded-lg border-gray-300"></textarea>
			</label>

			<div class="mt-2 flex gap-2">
				{#if onClose}
					<button type="button" onclick={onClose} class="flex-1 btn btn-secondary"
						>{locale.log.dialog.cancel}</button
					>
				{:else}
					<a href="/" class="flex-1 btn btn-secondary">{locale.log.dialog.cancel}</a>
				{/if}
				<button type="submit" class="flex-1 btn btn-primary">{locale.log.dialog.save}</button>
			</div>
		</form>
	</div>
</div>
