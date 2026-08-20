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

/**
 * Queues one log from the fields a `?/log` submission would carry, then
 * sends. `onQueued` fires as soon as the row is stored and visible — before
 * any network — which is when a dialog closes or a live card disappears.
 * The one enqueue-then-send sequence, shared by the dialog and the live walk.
 */
export async function queueLog(
	type: DialogType,
	fields: Record<string, string>,
	onQueued?: () => void
): Promise<void> {
	const occurred = time.stockholmInputToUtc(fields.occurred_at ?? '') ?? new Date();

	// Parsed here as well as on the server, so the row reads the same
	// before it is stored as it does afterwards.
	const data = new FormData();
	for (const [name, value] of Object.entries(fields)) {
		data.append(name, value);
	}
	const parsed = parseDetails(data, type.id);
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

	onQueued?.();
	await sendPending();
}

/** Builds the `use:enhance` handler for the log form. */
export function createLogSubmit(type: DialogType, onSaved: () => void): SubmitFunction {
	return ({ formData, cancel }) => {
		// The native submission would wait for the action and its reload.
		cancel();

		const fields: Record<string, string> = {};
		for (const [name, value] of formData.entries()) {
			if (typeof value === 'string') {
				fields[name] = value;
			}
		}
		void queueLog(type, fields, onSaved);
	};
}
