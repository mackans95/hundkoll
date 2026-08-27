// Reading the type-specific fields out of a submitted log form. Shared rather
// than server-only: the queue uses it too, so a log looks the same the
// instant it is saved as it does once it is stored.
//
// That sharing is also why the "a reveal needs a cause" rule lives here and
// not in the form action. Logging is offline-first — the dialog closes before
// anything reaches the server — so a rule only the server knew would accept the
// event, close the dialog, and surface a failed row minutes later.

import * as locale from '$lib/locale';
import type { EventDetails } from '$lib/types/domain';
import { fieldsFor, type DetailField } from './fields';

export type ParsedDetails =
	{ ok: true; details: EventDetails } | { ok: false; field: string; reason: 'value' | 'choice' };

export type DetailsFailure = Extract<ParsedDetails, { ok: false }>;

/**
 * How a parse failure reads. Here rather than at each caller because both the
 * queue and the form action report the same failures, and a rule enforced in
 * one place should not be worded in two.
 */
export function detailsMessage(failure: DetailsFailure): string {
	return failure.reason === 'choice'
		? locale.errors.chooseOne(failure.field)
		: locale.errors.invalidValue(failure.field);
}

/**
 * Reads a form's detail fields, following the same DETAIL_FIELDS list the
 * dialog rendered them from. Reports the offending field and what is wrong with
 * it; detailsMessage above turns that into something to show.
 */
export function parseDetails(form: FormData, typeId: string): ParsedDetails {
	return parseFields(form, fieldsFor(typeId));
}

/**
 * The same, over a field list given directly. Exists so the reveal rules can be
 * tested without declaring a type in DETAIL_FIELDS that nothing logs.
 */
export function parseFields(form: FormData, fields: DetailField[]): ParsedDetails {
	const details: EventDetails = {};
	const ticked = (name: string) => form.get(name) === 'on';

	for (const field of fields) {
		if (field.input === 'reveal') {
			// Absent rather than false when untouched: an accident that did not
			// happen has nothing to say, so it says nothing.
			if (ticked(field.name)) {
				details[field.name] = true;
			}
			continue;
		}

		// A collapsed reveal still posts whatever its inputs were left at —
		// hiding a checkbox does not clear it, and without JavaScript nothing
		// does. The parent decides, not the child's own input.
		if (field.revealedBy && !ticked(field.revealedBy)) {
			continue;
		}

		if (field.input === 'checkbox') {
			// A plain checkbox stores false, because "she did not finish" is a
			// real answer. Inside a reveal it is one of several causes, and an
			// unpicked cause is not an answer about anything.
			if (field.revealedBy && !ticked(field.name)) {
				continue;
			}
			details[field.name] = ticked(field.name);
		} else if (field.input === 'count') {
			// The stepper posts the count directly; rows queued before that
			// change replay the old checkbox + "<name>_count" pair, which must
			// keep reading — not be misread as zero.
			let count: number;
			if (ticked(field.name)) {
				const parsed = parseInt(String(form.get(`${field.name}_count`) ?? '1'), 10);
				count = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
			} else {
				const parsed = parseInt(String(form.get(field.name) ?? '0'), 10);
				count = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
			}
			if (field.revealedBy && count === 0) {
				continue;
			}
			details[field.name] = count;
		} else {
			const raw = String(form.get(field.name) ?? '')
				.trim()
				.replace(',', '.');
			if (raw) {
				const value = Number(raw);
				if (!Number.isFinite(value)) {
					return { ok: false, field: field.label, reason: 'value' };
				}
				details[field.name] = value;
			}
		}
	}

	// A ticked reveal says something happened, so it has to say what. Checked
	// after the loop because a cause can be declared anywhere below its reveal,
	// and presence in `details` is exactly what "answered" means above.
	for (const field of fields) {
		if (field.input !== 'reveal' || details[field.name] !== true) {
			continue;
		}
		const answered = fields.some(
			(other) => other.revealedBy === field.name && other.name in details
		);
		if (!answered) {
			return { ok: false, field: field.label, reason: 'choice' };
		}
	}

	return { ok: true, details };
}
