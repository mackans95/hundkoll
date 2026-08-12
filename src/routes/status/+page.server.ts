import type { PageServerLoad } from './$types';

export type StatusRow = {
	dog_id: string;
	type_id: string;
	label: string;
	category: 'routine' | 'care' | 'health';
	interval_days: number | null;
	last_at: string | null;
	due_at: string | null;
	icon: string | null;
	sort_order: number;
};

export const load: PageServerLoad = async ({ locals: { supabase } }) => {
	const { data } = await supabase
		.from('dog_care_status')
		.select('*')
		.order('sort_order')
		.overrideTypes<StatusRow[]>();

	const rows = data ?? [];
	return {
		// Timer cards for types with an expected interval, a plain
		// "last done" list for the rest.
		timed: rows.filter((r) => r.interval_days !== null),
		untimed: rows.filter((r) => r.interval_days === null)
	};
};
