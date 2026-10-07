import { fail } from '@sveltejs/kit';
import { listEventTypes } from '$lib/server/care';
import { readsFailed } from '$lib/server/reads';
import { readCardConfig, saveCardConfig } from '$lib/server/statsSettings';
import { cardHeading, planCardList, sameCards } from '$lib/stats/cardConfig';
import * as locale from '$lib/locale';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ setHeaders, locals: { supabase } }) => {
	const [cards, types] = await Promise.all([readCardConfig(supabase), listEventTypes(supabase)]);
	readsFailed(setHeaders, cards);

	return {
		// The catalogue names a card whose type has no words of its own; a
		// failed read of it only costs that name.
		cards: (cards ?? []).map((card) => ({
			...card,
			label: cardHeading(
				card.type,
				types?.find((type) => type.id === card.type)
			)
		})),
		failed: cards === null
	};
};

export const actions: Actions = {
	save: async ({ request, locals: { supabase } }) => {
		const current = await readCardConfig(supabase);
		if (!current) return fail(503, { message: locale.errors.saveFailed });

		const next = planCardList(await request.formData());
		if (!sameCards(current, next)) {
			const message = await saveCardConfig(supabase, next);
			if (message) return fail(400, { message });
		}
		// No redirect: the page stays where it was and toasts.
		return { saved: true };
	}
};
