import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import type { RequestHandler } from './$types';

// The settings are sub-pages now (plan 25); an old link still lands on one.
export const GET: RequestHandler = () => redirect(307, resolve('/settings/intervals'));
