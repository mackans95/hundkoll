// Where the log form decides between sending and keeping.
//
// Without signal the submission is held on the phone instead of failing.
// The row id already travels with the form, so sending it later cannot
// duplicate the event — see queue.svelte.ts.

import type { SubmitFunction } from '@sveltejs/kit';
import * as time from '$lib/time';
import type { EventType } from '$lib/types/domain';
import { enqueue } from './queue.svelte';

type DialogType = Pick<EventType, 'id' | 'label' | 'icon'>;

/**
 * Builds the `use:enhance` handler for the log form: it posts normally when
 * there is signal, and keeps the submission on the phone when there is not,
 * either because the network was already gone or because the send failed.
 */
export function createLogSubmit(type: DialogType, onQueued: () => void): SubmitFunction {
	/**
	 * Copies the submitted form into the queue and closes the dialog, so the
	 * log can be replayed later exactly as it would have been posted.
	 */
	async function queue(formData: FormData) {
		const fields: Record<string, string> = {};
		for (const [name, value] of formData.entries()) {
			if (typeof value === 'string') {
				fields[name] = value;
			}
		}
		const occurred = time.stockholmInputToUtc(fields.occurred_at ?? '') ?? new Date();
		await enqueue({
			id: fields.event_id,
			typeId: type.id,
			label: type.label,
			icon: type.icon,
			occurredAt: occurred.toISOString(),
			fields,
			attempts: 0
		});
		onQueued();
	}

	return ({ formData, cancel }) => {
		if (!navigator.onLine) {
			cancel();
			queue(formData);
			return;
		}
		return async ({ result, update }) => {
			// The connection dropped between opening the dialog and saving.
			if (result.type === 'error') {
				await queue(formData);
				return;
			}
			await update();
		};
	};
}
