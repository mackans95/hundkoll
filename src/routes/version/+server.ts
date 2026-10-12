// Whether anything moved since a page was read (plan 31b). The service worker
// never answers this one, so "nothing changed" only ever comes from here.

import { error, json } from '@sveltejs/kit';
import { currentStamp } from '$lib/server/dataVersion';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals: { supabase, userId } }) => {
	if (!userId) error(401);
	const stamp = await currentStamp(supabase);
	if (!stamp) error(503);
	return json(stamp, { headers: { 'cache-control': 'no-store' } });
};
