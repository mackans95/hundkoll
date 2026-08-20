// Reading the type-specific fields out of a submitted log form. Shared rather
// than server-only: the queue uses it too, so a log looks the same the
// instant it is saved as it does once it is stored.

import type { EventDetails } from '$lib/types/domain';
import { fieldsFor } from './fields';

export type ParsedDetails = { ok: true; details: EventDetails } | { ok: false; field: string };

/**
 * Reads a form's detail fields, following the same DETAIL_FIELDS list the
 * dialog rendered them from. Reports the offending field, not a message, so
 * the caller decides the phrasing.
 */
export function parseDetails(form: FormData, typeId: string): ParsedDetails {
	const details: EventDetails = {};

	for (const field of fieldsFor(typeId)) {
		if (field.input === 'checkbox') {
			details[field.name] = form.get(field.name) === 'on';
		} else if (field.input === 'count') {
			// The stepper posts the count directly; rows queued before that
			// change replay the old checkbox + "<name>_count" pair, which must
			// keep reading — not be misread as zero.
			if (form.get(field.name) === 'on') {
				const count = parseInt(String(form.get(`${field.name}_count`) ?? '1'), 10);
				details[field.name] = Number.isFinite(count) && count > 0 ? count : 1;
			} else {
				const count = parseInt(String(form.get(field.name) ?? '0'), 10);
				details[field.name] = Number.isFinite(count) && count > 0 ? count : 0;
			}
		} else {
			const raw = String(form.get(field.name) ?? '')
				.trim()
				.replace(',', '.');
			if (raw) {
				const value = Number(raw);
				if (!Number.isFinite(value)) {
					return { ok: false, field: field.label };
				}
				details[field.name] = value;
			}
		}
	}

	return { ok: true, details };
}
