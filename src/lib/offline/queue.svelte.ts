// Where a log lives between being tapped and being stored.
//
// Every log goes through here, not just the ones made without signal. The
// point is that saving never blocks on the network: the row is written to
// IndexedDB, shown in the list, and sent in the background. Two sequential
// requests to Stockholm are what used to make Spara feel dead for a second
// or two on a phone whose radio had gone to sleep.
//
// Replaying is safe because every queued log already carries the row id
// generated when the dialog rendered: a send that reached the server but lost
// its response collides on the primary key, which the action reports as
// success rather than logging the walk twice.

import { deserialize } from '$app/forms';
import type { EventDetails } from '$lib/types/domain';

const STORE = 'queue';

export type QueuedLog = {
	/** The events row id — also the queue key, which makes replays safe. */
	id: string;
	typeId: string;
	label: string;
	icon: string | null;
	/** ISO timestamp, for showing the row while it waits. */
	occurredAt: string;
	/** The form fields exactly as they would have been posted. */
	fields: Record<string, string>;
	/** Parsed the same way the action will parse them, so the row reads the
	 * same before and after it is stored. */
	details: EventDetails;
	note: string | null;
	/** Server failures that might still succeed. Network outages do not count. */
	attempts: number;
	/**
	 * True once a send has been tried and could not get through, which is what
	 * earns a row the hourglass. A log still in flight looks like a saved one,
	 * so the common case shows no waiting state at all.
	 */
	waiting: boolean;
	/** Set when the server rejected the log outright; retrying cannot help. */
	error: string | null;
	/**
	 * Stored, but the page data has not caught up yet. Kept in the list until
	 * it has, otherwise the row would vanish and reappear.
	 */
	landed: boolean;
};

/**
 * Reactive view of the queue, for the pending rows and the banner.
 *
 * Module-level state is safe here only because it is populated exclusively in
 * the browser — from IndexedDB, after mount. The server always renders the
 * initial empty queue, so nothing can leak between users during SSR. Keep it
 * that way: nothing running on the server may write to this.
 */
export const offlineQueue = $state<{ items: QueuedLog[]; sending: boolean }>({
	items: [],
	sending: false
});

/**
 * Opens the queue database, creating the object store on first run. Keyed by
 * the event's row id, so putting the same log twice replaces it rather than
 * queueing it again.
 */
function openDb(): Promise<IDBDatabase> {
	const DB_NAME = 'hundkoll';
	const DB_VERSION = 1;

	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION);
		request.onupgradeneeded = () => {
			if (!request.result.objectStoreNames.contains(STORE)) {
				request.result.createObjectStore(STORE, { keyPath: 'id' });
			}
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

/**
 * Runs one request against the store and resolves with its result, so the
 * callers below can read like ordinary async functions instead of nesting
 * IndexedDB event handlers.
 */
function tx<T>(
	mode: IDBTransactionMode,
	run: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
	return openDb().then(
		(db) =>
			new Promise<T>((resolve, reject) => {
				const request = run(db.transaction(STORE, mode).objectStore(STORE));
				request.onsuccess = () => resolve(request.result);
				request.onerror = () => reject(request.error);
			})
	);
}

/** Replaces one item in the reactive list, leaving the rest alone. */
function patch(id: string, changes: Partial<QueuedLog>): void {
	offlineQueue.items = offlineQueue.items.map((item) =>
		item.id === id ? { ...item, ...changes } : item
	);
}

/**
 * Reads the queue off disk into the reactive state, newest first. Anything
 * still here at launch failed to send last time, so it starts out waiting. A
 * database that cannot be opened — private mode, or storage denied — is
 * treated as an empty queue, since the app still works online without one.
 */
export async function loadQueue(): Promise<void> {
	try {
		const items = await tx<QueuedLog[]>('readonly', (store) => store.getAll());
		offlineQueue.items = items
			.map((item) => ({ ...item, waiting: true, landed: false }))
			.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
	} catch {
		offlineQueue.items = [];
	}
}

export type NewLog = Pick<
	QueuedLog,
	'id' | 'typeId' | 'label' | 'icon' | 'occurredAt' | 'fields' | 'details' | 'note'
>;

/**
 * Stores a log and shows it in the list straight away, so Spara can close the
 * dialog without waiting for Stockholm.
 */
export async function enqueue(log: NewLog): Promise<void> {
	const queued: QueuedLog = { ...log, attempts: 0, waiting: false, error: null, landed: false };
	offlineQueue.items = [queued, ...offlineQueue.items.filter((item) => item.id !== queued.id)];
	// Written after the list updates: the point is not to block the dialog.
	await tx('readwrite', (store) => store.put(queued));
}

/** Takes a log out of the database, whether it landed or was rejected. */
async function forget(id: string): Promise<void> {
	await tx('readwrite', (store) => store.delete(id));
}

/** Drops the rows the page data has now caught up with. */
export function pruneLanded(): void {
	offlineQueue.items = offlineQueue.items.filter((item) => !item.landed);
}

/** Clears a rejected row once the user has read why it failed. */
export async function dismiss(id: string): Promise<void> {
	await forget(id);
	offlineQueue.items = offlineQueue.items.filter((item) => item.id !== id);
}

/** Marks everything undelivered as waiting, after a pass that got nowhere. */
function markWaiting(): void {
	offlineQueue.items = offlineQueue.items.map((item) =>
		item.landed || item.error ? item : { ...item, waiting: true }
	);
}

/**
 * Sends everything waiting, oldest first so the list keeps its order once the
 * rows land. Returns how many reached the server, which tells the caller
 * whether the page data it is showing is now stale.
 */
export async function flushQueue(): Promise<number> {
	const MAX_ATTEMPTS = 5;

	if (offlineQueue.sending) {
		return 0;
	}
	const pending = offlineQueue.items.filter((item) => !item.landed && !item.error);
	if (pending.length === 0) {
		return 0;
	}

	offlineQueue.sending = true;
	let sent = 0;

	try {
		for (const log of [...pending].reverse()) {
			const body = new FormData();
			for (const [name, value] of Object.entries(log.fields)) {
				body.append(name, value);
			}

			let response: Response;
			try {
				response = await fetch('/?/log', {
					method: 'POST',
					body,
					credentials: 'same-origin',
					// Ask for the action result rather than a rendered page: a
					// form action answers 200 with a JSON body either way, so the
					// status alone cannot tell success from a bounce to /login.
					headers: { accept: 'application/json' }
				});
			} catch {
				// No signal. Everything still queued keeps waiting.
				markWaiting();
				break;
			}

			const result = await readResult(response);

			// Bounced to the login page: the session expired. The log is still
			// good, so hold everything until there is a session again.
			if (result?.type === 'redirect' && result.location?.startsWith('/login')) {
				markWaiting();
				break;
			}

			if (response.ok && (result?.type === 'redirect' || result?.type === 'success')) {
				await forget(log.id);
				// Kept in the list, without its hourglass, until the reload that
				// follows brings back the stored row to replace it.
				patch(log.id, { landed: true, waiting: false });
				sent += 1;
			} else if (result?.type === 'failure' || (response.status >= 400 && response.status < 500)) {
				// The server rejected the log itself; retrying cannot help, so say
				// so rather than discarding what was typed.
				await forget(log.id);
				patch(log.id, { error: result?.message ?? null, waiting: false });
			} else if (log.attempts + 1 >= MAX_ATTEMPTS) {
				await forget(log.id);
				patch(log.id, { error: result?.message ?? null, waiting: false });
			} else {
				const attempts = log.attempts + 1;
				await tx('readwrite', (store) => store.put({ ...log, attempts, waiting: true }));
				patch(log.id, { attempts, waiting: true });
			}
		}
	} finally {
		offlineQueue.sending = false;
	}

	return sent;
}

type SendResult = { type: string; location?: string; message?: string };

/**
 * Reads the action's answer, including the failure message, which SvelteKit
 * encodes rather than sending as plain JSON.
 */
async function readResult(response: Response): Promise<SendResult | null> {
	try {
		const parsed = deserialize<Record<string, unknown>, { message?: string }>(
			await response.text()
		);
		return {
			type: parsed.type,
			location: parsed.type === 'redirect' ? parsed.location : undefined,
			message: parsed.type === 'failure' ? parsed.data?.message : undefined
		};
	} catch {
		return null;
	}
}
