import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

type EventType = {
	id: string;
	label: string;
	category: 'routine' | 'care' | 'health';
	icon: string | null;
	interval_days: number | null;
};

export const load: PageServerLoad = async ({ url, locals: { supabase } }) => {
	const { data } = await supabase
		.from('event_types')
		.select('id, label, category, icon, interval_days')
		.order('sort_order')
		.overrideTypes<EventType[]>();

	return {
		types: data ?? [],
		saved: url.searchParams.has('saved')
	};
};

export const actions: Actions = {
	save: async ({ request, locals: { supabase } }) => {
		const form = await request.formData();
		const { data: types } = await supabase
			.from('event_types')
			.select('id, interval_days')
			.overrideTypes<{ id: string; interval_days: number | null }[]>();

		for (const type of types ?? []) {
			const raw = String(form.get(`interval_${type.id}`) ?? '').trim();
			const value = raw === '' ? null : parseInt(raw, 10);
			if (value !== null && (!Number.isFinite(value) || value < 1)) {
				return fail(400, { message: 'Intervall måste vara ett antal dagar (minst 1).' });
			}
			if (value !== type.interval_days) {
				const { error } = await supabase
					.from('event_types')
					.update({ interval_days: value })
					.eq('id', type.id);
				if (error) {
					console.error('interval update failed:', error.code, error.message);
					return fail(500, { message: 'Kunde inte spara.' });
				}
			}
		}

		redirect(303, '/settings?saved');
	},
	logout: async ({ locals: { supabase } }) => {
		await supabase.auth.signOut();
		redirect(303, '/login');
	}
};
