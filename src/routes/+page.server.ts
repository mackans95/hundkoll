import { fail, redirect } from '@sveltejs/kit';
import { DETAIL_FIELDS } from '$lib/events';
import { stockholmInputToUtc, stockholmNowForInput } from '$lib/time';
import type { Actions, PageServerLoad } from './$types';

// Without generated database types, PostgREST embeds are typed as arrays;
// a to-one FK embed actually returns a single object.
type EventRow = {
	id: string;
	type_id: string;
	occurred_at: string;
	note: string | null;
	details: Record<string, unknown>;
	type: { label: string; icon: string | null } | null;
};

type EventType = {
	id: string;
	label: string;
	category: 'routine' | 'care' | 'health';
	icon: string | null;
};

export const load: PageServerLoad = async ({ url, locals: { supabase } }) => {
	const [dogResult, typesResult, eventsResult] = await Promise.all([
		supabase.from('dogs').select('id, name').limit(1).maybeSingle(),
		supabase
			.from('event_types')
			.select('id, label, category, icon')
			.order('sort_order')
			.overrideTypes<EventType[]>(),
		supabase
			.from('events')
			.select('id, type_id, occurred_at, note, details, type:event_types(label, icon)')
			.order('occurred_at', { ascending: false })
			.limit(10)
			.overrideTypes<EventRow[]>()
	]);

	const types = typesResult.data ?? [];
	// ?detail=<type_id> renders the backdating dialog server-side, so it
	// opens (and closes, via a plain link to "/") without JavaScript.
	const detailParam = url.searchParams.get('detail');

	return {
		dog: dogResult.data,
		types,
		events: eventsResult.data ?? [],
		detailType: types.find((t) => t.id === detailParam) ?? null,
		nowLocal: stockholmNowForInput(),
		// The row id travels with the form so a resubmit — a double tap, or a
		// retry after a response was lost — collides on the primary key
		// instead of inserting the same walk twice.
		eventId: crypto.randomUUID()
	};
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const actions: Actions = {
	log: async ({ request, locals: { supabase } }) => {
		const form = await request.formData();
		const typeId = String(form.get('type_id') ?? '');

		const { data: dog } = await supabase.from('dogs').select('id').limit(1).maybeSingle();
		if (!dog) {
			return fail(400, { message: 'Ingen hund hittades. Har seed-SQL:en körts?' });
		}

		const row: Record<string, unknown> = { dog_id: dog.id, type_id: typeId };

		const eventId = String(form.get('event_id') ?? '');
		if (UUID_RE.test(eventId)) {
			row.id = eventId;
		}

		const occurredRaw = String(form.get('occurred_at') ?? '').trim();
		if (occurredRaw) {
			const occurred = stockholmInputToUtc(occurredRaw);
			if (!occurred) {
				return fail(400, { message: 'Ogiltig tidpunkt.' });
			}
			row.occurred_at = occurred.toISOString();
		}

		// Dialog submissions carry all their fields (marked by `detailed`);
		// quick taps carry only type_id. Checkboxes are only trustworthy as
		// true/false when we know the form actually rendered them.
		if (form.has('detailed')) {
			const details: Record<string, unknown> = {};
			for (const field of DETAIL_FIELDS[typeId] ?? []) {
				if (field.input === 'checkbox') {
					details[field.name] = form.get(field.name) === 'on';
				} else if (field.input === 'count') {
					// Checkbox + stepper; without JS only the checkbox
					// submits, which counts as one.
					if (form.get(field.name) === 'on') {
						const count = parseInt(String(form.get(`${field.name}_count`) ?? '1'), 10);
						details[field.name] = Number.isFinite(count) && count > 0 ? count : 1;
					} else {
						details[field.name] = 0;
					}
				} else {
					const raw = String(form.get(field.name) ?? '')
						.trim()
						.replace(',', '.');
					if (raw) {
						const value = Number(raw);
						if (!Number.isFinite(value)) {
							return fail(400, { message: `Ogiltigt värde för ${field.label.toLowerCase()}.` });
						}
						details[field.name] = value;
					}
				}
			}
			if (Object.keys(details).length > 0) {
				row.details = details;
			}
			const note = String(form.get('note') ?? '').trim();
			if (note) {
				row.note = note;
			}
		}

		const { error } = await supabase.from('events').insert(row);
		// 23505 = unique violation: this exact event is already stored, so the
		// submission was a duplicate rather than a failure.
		if (error && error.code !== '23505') {
			console.error('event insert failed:', error.code, error.message);
			return fail(500, { message: 'Kunde inte logga händelsen.' });
		}

		// Also clears any ?detail= param, closing the dialog.
		redirect(303, '/');
	}
};
