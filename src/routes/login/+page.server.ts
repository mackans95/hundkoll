import { fail } from '@sveltejs/kit';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async ({ request, url, locals: { supabase } }) => {
		const form = await request.formData();
		const email = String(form.get('email') ?? '').trim();

		if (!email) {
			return fail(400, { email, message: 'Ange din mejladress.' });
		}

		const { error } = await supabase.auth.signInWithOtp({
			email,
			options: {
				// Signup is disabled in the dashboard; this keeps the API from
				// creating users even if that setting ever changes.
				shouldCreateUser: false,
				emailRedirectTo: `${url.origin}/auth/callback`
			}
		});

		if (error) {
			return fail(400, { email, message: 'Kunde inte skicka länken. Kontrollera adressen.' });
		}

		return { sent: true, email };
	}
};
