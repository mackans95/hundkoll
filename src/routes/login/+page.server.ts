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
			// Surface the real cause in Vercel logs; the UI stays in Swedish.
			console.error('signInWithOtp failed:', error.code, error.status, error.message);
			const message =
				error.code === 'otp_disabled'
					? 'Ingen användare med den adressen.'
					: error.code === 'over_email_send_rate_limit'
						? 'För många mejl på kort tid – vänta en stund och försök igen.'
						: 'Kunde inte skicka länken. Försök igen.';
			return fail(400, { email, message });
		}

		return { sent: true, email };
	}
};
