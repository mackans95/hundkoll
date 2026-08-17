import { fail, redirect } from '@sveltejs/kit';
import * as locale from '$lib/locale';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async ({ request, locals: { supabase } }) => {
		const form = await request.formData();
		const email = String(form.get('email') ?? '').trim();
		const password = String(form.get('password') ?? '');

		if (!email || !password) {
			return fail(400, { email, message: locale.errors.missingCredentials });
		}

		const { error } = await supabase.auth.signInWithPassword({ email, password });
		if (error) {
			// Surface the real cause in Vercel logs; the UI stays in Swedish.
			console.error('signInWithPassword failed:', error.code, error.status, error.message);
			const message =
				error.code === 'invalid_credentials'
					? locale.errors.invalidCredentials
					: locale.errors.loginFailed;
			return fail(400, { email, message });
		}

		redirect(303, '/');
	}
};
