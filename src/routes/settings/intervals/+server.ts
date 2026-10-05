import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import type { RequestHandler } from './$types';

// The intervals moved onto each type's page (plan 26); an old link still lands.
export const GET: RequestHandler = () => redirect(307, resolve('/settings/types'));
