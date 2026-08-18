// The one place that decides when the queue gets sent and when the page
// refreshes, so the layout, the log form and the `online` event all agree.

import { invalidateAll } from '$app/navigation';
import { flushQueue, pruneLanded } from './queue.svelte';

/**
 * Sends anything waiting and refreshes the page data if something landed —
 * refresh before pruning, so a row never disappears between send and read-back.
 */
export async function sendPending(): Promise<void> {
	if ((await flushQueue()) === 0) {
		return;
	}

	await invalidateAll();
	pruneLanded();
}
