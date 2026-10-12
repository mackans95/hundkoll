import { onMount } from 'svelte';
import { createClock } from './clock';

/**
 * The server's render time until hydrated, then the phone's, ticking. A page
 * may be a copy the service worker kept from hours ago (plan 31b): its `now`
 * only holds for hydration to agree with the server's HTML.
 * Call during component setup.
 */
export function liveNow(server: () => Date, intervalMs = 30_000): { readonly now: Date } {
	const clock = createClock(intervalMs);
	let hydrated = $state(false);
	onMount(() => {
		hydrated = true;
	});
	return {
		get now(): Date {
			return hydrated ? clock.now : server();
		}
	};
}
