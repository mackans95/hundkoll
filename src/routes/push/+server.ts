// This phone's FCM token, stored for the signed-in user when reminders are
// switched on (plan 19), and removed when they are switched off.

import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

async function readToken(request: Request): Promise<string> {
	const body = await request.json().catch(() => null);
	const token = body?.token;
	if (typeof token !== 'string' || token.length === 0 || token.length > 4096) {
		error(400, 'token');
	}
	return token;
}

export const POST: RequestHandler = async ({ request, locals: { supabase, user } }) => {
	if (!user) error(401);
	const token = await readToken(request);

	// Insert, or on a token already stored just mark it seen: the grant allows
	// updating seen_at and nothing else, so an upsert would be refused.
	const insert = await supabase.from('push_devices').insert({ token, user_id: user.id });
	if (insert.error?.code === '23505') {
		const seen = await supabase
			.from('push_devices')
			.update({ seen_at: new Date().toISOString() })
			.eq('token', token);
		if (seen.error) {
			console.error('push token refresh failed:', seen.error.code, seen.error.message);
			error(500);
		}
	} else if (insert.error) {
		console.error('push token insert failed:', insert.error.code, insert.error.message);
		error(500);
	}
	return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ request, locals: { supabase, user } }) => {
	if (!user) error(401);
	const token = await readToken(request);
	const { error: failed } = await supabase.from('push_devices').delete().eq('token', token);
	if (failed) {
		console.error('push token delete failed:', failed.code, failed.message);
		error(500);
	}
	return json({ ok: true });
};
