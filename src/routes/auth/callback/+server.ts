import { redirect } from '@sveltejs/kit';
import type { EmailOtpType } from '@supabase/supabase-js';
import type { RequestHandler } from './$types';

// Magic links land here in one of two shapes depending on flow:
// ?code=... (PKCE) or ?token_hash=...&type=magiclink (OTP).
export const GET: RequestHandler = async ({ url, locals: { supabase } }) => {
	const code = url.searchParams.get('code');
	const tokenHash = url.searchParams.get('token_hash');
	const type = url.searchParams.get('type') as EmailOtpType | null;

	if (code) {
		const { error } = await supabase.auth.exchangeCodeForSession(code);
		if (!error) {
			redirect(303, '/');
		}
	} else if (tokenHash && type) {
		const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
		if (!error) {
			redirect(303, '/');
		}
	}

	redirect(303, '/login?error=auth');
};
