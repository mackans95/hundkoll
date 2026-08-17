/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
import * as locale from '$lib/locale';
import { build, files, version } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;

// One cache per build. A deploy opens a new one and activate drops the
// old, so a stale bundle can never outlive the version it belongs to.
const CACHE = `hundkoll-${version}`;

// Content-hashed bundles plus everything in static/ — immutable within
// a build, so they can be served without ever asking the network.
const PRECACHE = [...build, ...files];
const PRECACHE_PATHS = new Set(PRECACHE);

// `build` is empty under `vite dev`. Intercepting there would shadow the
// dev server with stale responses, so the worker stands down entirely.
const DEV = build.length === 0;

sw.addEventListener('install', (event) => {
	event.waitUntil(
		(async () => {
			const cache = await caches.open(CACHE);
			await cache.addAll(PRECACHE);

			// The page load that installs this worker is fetched before the
			// worker controls anything, so the app's own HTML would not be
			// cached by it — and the first offline launch would have nothing
			// to show. Fetch the log page here so that launch works.
			try {
				const response = await fetch('/', { credentials: 'same-origin' });
				if (response.status === 200 && !response.redirected) {
					await cache.put('/', response);
				}
			} catch {
				// Installing while offline; the first online navigation caches it.
			}

			await sw.skipWaiting();
		})()
	);
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
			)
			.then(() => sw.clients.claim())
	);
});

sw.addEventListener('fetch', (event) => {
	if (DEV) return;

	const { request } = event;
	// Logging POSTs have to reach the server; queueing them is 5c's job.
	if (request.method !== 'GET') return;

	const url = new URL(request.url);
	// Leave Supabase and any other origin alone.
	if (url.origin !== sw.location.origin) return;
	// Never answer an auth page from cache.
	if (url.pathname === '/login') return;

	event.respondWith(respond(event));
});

/**
 * Answers a request: precached assets straight from the cache, everything
 * else from the network with the last good copy kept as a fallback. That
 * fallback is what lets the app open at all without signal.
 */
async function respond(event: FetchEvent): Promise<Response> {
	const { request } = event;
	const url = new URL(request.url);
	const cache = await caches.open(CACHE);

	// Immutable assets: straight from cache, no network round trip.
	if (PRECACHE_PATHS.has(url.pathname)) {
		const cached = await cache.match(url.pathname);
		if (cached) return cached;
	}

	// Pages and their data: prefer fresh, but keep the last good copy —
	// that copy is what lets the app open at all without signal.
	try {
		const response = await fetch(request);
		// A redirected response belongs to a different URL — caching it under
		// this one would, for an expired session, pin the login page in place
		// of the app.
		if (response.status === 200 && !response.redirected) {
			event.waitUntil(cache.put(request, response.clone()));
		}
		return response;
	} catch {
		// ignoreVary: SvelteKit varies its responses on headers that differ
		// between a navigation and a data request, which would otherwise turn
		// a perfectly good cached page into a miss.
		const cached = await cache.match(request, { ignoreVary: true });
		if (cached) return cached;

		// An unvisited page with nothing cached: fall back to the log
		// page, which is the one worth reaching anyway.
		if (request.mode === 'navigate') {
			const home = await cache.match('/', { ignoreVary: true });
			if (home) return home;
		}
		return offlineResponse();
	}
}

/**
 * Explains itself in Swedish when there is nothing cached and no network,
 * which is nicer than the browser's own error page.
 */
function offlineResponse(): Response {
	const html = `<!doctype html>
<html lang="sv">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<title>${locale.offline.title} – ${locale.app.name}</title>
		<style>
			body { font-family: system-ui, sans-serif; margin: 0; min-height: 100dvh;
				display: flex; flex-direction: column; align-items: center;
				justify-content: center; gap: 0.5rem; padding: 2rem; text-align: center; }
			h1 { font-size: 1.25rem; margin: 0; }
			p { color: #6b7280; margin: 0; }
		</style>
	</head>
	<body>
		<h1>${locale.offline.heading}</h1>
		<p>${locale.offline.body}</p>
	</body>
</html>`;
	return new Response(html, {
		status: 503,
		headers: { 'content-type': 'text/html; charset=utf-8' }
	});
}
