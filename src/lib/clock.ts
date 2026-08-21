// The passing of time as a reactive value. Reading `now` inside a template
// re-reads it on every interval; the timer is started by the first reader and
// stopped when the last one goes away, so nothing ticks off screen.
//
// createSubscriber rather than $state written from an $effect: the wall clock
// is external to Svelte, which is exactly what it is for — and it keeps the
// timer out of the components that merely display a duration.

import { createSubscriber } from 'svelte/reactivity';

/**
 * A clock that invalidates its readers every `intervalMs`. Never runs on the
 * server, where a template read is not an effect and so subscribes to nothing.
 * createClock(1000).now → the current Date, re-read once a second
 */
export function createClock(intervalMs: number): { readonly now: Date } {
	const subscribe = createSubscriber((update) => {
		const id = setInterval(update, intervalMs);
		return () => clearInterval(id);
	});

	return {
		get now(): Date {
			subscribe();
			// Read fresh, not stored: a phone that slept through 20 intervals
			// still comes back with the true time rather than a stale tick.
			return new Date();
		}
	};
}
