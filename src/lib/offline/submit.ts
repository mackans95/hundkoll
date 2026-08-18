// What Spara actually does. Nothing here waits for the server: the log is
// written to IndexedDB, the dialog closes, and the send happens afterwards.
// The row id already travels with the form, so sending later cannot
// duplicate the event; see queue.svelte.ts.

import type { SubmitFunction } from '@sveltejs/kit';
import { parseDetails } from '$lib/events/details';
import * as time from '$lib/time';
import type { EventType } from '$lib/types/domain';
import { enqueue, sendPending } from './queue.svelte';

type DialogType = Pick<EventType, 'id' | 'label' | 'icon'>;

/** Builds the `use:enhance` handler for the log form. */
export function createLogSubmit(type: DialogType, onSaved: () => void): SubmitFunction {
	return ({ formData, cancel }) => {
		// The native submission would wait for the action and its reload.
		cancel();
		void save(formData);
	};

	async function save(formData: FormData) {
		const fields: Record<string, string> = {};
		for (const [name, value] of formData.entries()) {
			if (typeof value === 'string') {
				fields[name] = value;
			}
		}

		const occurred = time.stockholmInputToUtc(fields.occurred_at ?? '') ?? new Date();
		// Parsed here as well as on the server, so the row reads the same
		// before it is stored as it does afterwards.
		const parsed = parseDetails(formData, type.id);
		const note = (fields.note ?? '').trim();

		await enqueue({
			id: fields.event_id,
			typeId: type.id,
			label: type.label,
			icon: type.icon,
			occurredAt: occurred.toISOString(),
			fields,
			details: parsed.ok ? parsed.details : {},
			note: note || null
		});

		onSaved();
		await sendPending();
	}
}
