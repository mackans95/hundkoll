// A live walk's marker (plan 30): while it stands, the remind function sends
// no "om 30 min" for the walk to either phone. Started and ended by the page.

import { error, json } from '@sveltejs/kit';
import { currentDog } from '$lib/server/dog';
import type { RequestHandler } from './$types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function readSession(request: Request): Promise<{ sessionId: string; typeId: string }> {
	const body = await request.json().catch(() => null);
	const sessionId = body?.sessionId;
	const typeId = body?.typeId;
	if (typeof sessionId !== 'string' || !UUID.test(sessionId)) error(400, 'sessionId');
	if (typeof typeId !== 'string' || typeId.length === 0 || typeId.length > 64) error(400, 'typeId');
	return { sessionId, typeId };
}

export const POST: RequestHandler = async ({ request, locals: { supabase, user } }) => {
	if (!user) error(401);
	const { sessionId, typeId } = await readSession(request);
	const dog = await currentDog(supabase);
	if (!dog) error(404);

	// created_at is set here, as an upsert leaves the column default alone on a conflict.
	const { error: failed } = await supabase.from('live_sessions').upsert({
		dog_id: dog.id,
		type_id: typeId,
		session_id: sessionId,
		created_at: new Date().toISOString()
	});
	if (failed) {
		console.error('live session insert failed:', failed.code, failed.message);
		error(500);
	}
	return json({ ok: true });
};

// By session id, so a late call from an old walk cannot end a newer one.
export const DELETE: RequestHandler = async ({ request, locals: { supabase, user } }) => {
	if (!user) error(401);
	const { sessionId } = await readSession(request);
	const { error: failed } = await supabase
		.from('live_sessions')
		.delete()
		.eq('session_id', sessionId);
	if (failed) {
		console.error('live session delete failed:', failed.code, failed.message);
		error(500);
	}
	return json({ ok: true });
};
