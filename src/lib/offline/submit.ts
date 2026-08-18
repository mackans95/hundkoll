// What Spara actually does.
//
// Nothing here waits for the server. The log is written to IndexedDB, the
// dialog closes, and the send happens afterwards — so tapping Spara is
// immediate whether or not the phone has a usable connection, and the two
// round trips it used to block on now happen with nobody watching.
//
// The row id already travels with the form, so sending later cannot duplicate
// the event; see queue.svelte.ts.

import type { SubmitFunction } from '@sveltejs/kit';
import { parseDetails } from '$lib/events/details';
import * as time from '$lib/time';
import type { EventType } from '$lib/types/domain';
import { enqueue } from './queue.svelte';
import { sendPending } from './sync';

type DialogType = Pick<EventType, 'id' | 'label' | 'icon'>;

/** Builds the `use:enhance` handler for the log form. */
export function createLogSubmit(type: DialogType, onSaved: () => void): SubmitFunction {
	return ({ formData, cancel }) => {
		// The native submission is never used: it would mean waiting for the
		// action and then for the reload it triggers.
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
		// Parsed here as well as on the server, so the row in the list reads the
		// same before it is stored as it does afterwards. The browser's own
		// validation already blocks the values this could reject.
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
