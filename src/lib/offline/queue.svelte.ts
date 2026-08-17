// Logs made without signal are held here until they can be sent.
//
// Every queued log already carries the row id generated when the dialog
// rendered, so replaying one is idempotent: if a send actually reached
// the server but the response was lost, the retry collides on the
// primary key and the server reports success rather than logging the
// walk twice.

const STORE = 'queue';

/** The shape SvelteKit answers a form action with. */
type ActionResult = {
	type: 'success' | 'failure' | 'redirect' | 'error';
	status?: number;
	location?: string;
};

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
	attempts: number;
};

/** Reactive view of the queue, for the pending rows and the banner. */
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

/**
 * Reads the queue off disk into the reactive state, newest first. A database
 * that cannot be opened — private mode, or storage denied — is treated as an
 * empty queue, since the app still works online without one.
 */
export async function loadQueue(): Promise<void> {
	try {
		const items = await tx<QueuedLog[]>('readonly', (store) => store.getAll());
		offlineQueue.items = items.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
	} catch {
		// Private mode or a blocked database: the app still works online.
		offlineQueue.items = [];
	}
}

/**
 * Stores a log to send later and shows it in the list straight away, so a tap
 * without signal still looks like it was recorded.
 */
export async function enqueue(log: QueuedLog): Promise<void> {
	await tx('readwrite', (store) => store.put(log));
	offlineQueue.items = [log, ...offlineQueue.items.filter((item) => item.id !== log.id)];
}

/** Forgets a queued log, because it landed or because it never will. */
async function drop(id: string): Promise<void> {
	await tx('readwrite', (store) => store.delete(id));
	offlineQueue.items = offlineQueue.items.filter((item) => item.id !== id);
}

/** Records that a send failed, so a log cannot be retried forever. */
async function bumpAttempts(log: QueuedLog): Promise<void> {
	const updated = { ...log, attempts: log.attempts + 1 };
	await tx('readwrite', (store) => store.put(updated));
	offlineQueue.items = offlineQueue.items.map((item) => (item.id === log.id ? updated : item));
}

/**
 * Sends everything waiting, oldest first so the list keeps its order once the
 * rows land. Returns how many reached the server, which tells the caller
 * whether the page data it is showing is now stale.
 */
export async function flushQueue(): Promise<number> {
	const MAX_ATTEMPTS = 5;

	if (offlineQueue.sending || offlineQueue.items.length === 0) return 0;
	offlineQueue.sending = true;
	let sent = 0;

	try {
		// Oldest first, so the list keeps its order once the rows land.
		for (const log of [...offlineQueue.items].reverse()) {
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
				// Still no signal — stop and keep the rest for next time.
				break;
			}

			const result = (await response.json().catch(() => null)) as ActionResult | null;

			// Bounced to the login page: the session expired. The log is still
			// good, so hold everything until there is a session again.
			if (result?.type === 'redirect' && result.location?.startsWith('/login')) {
				break;
			}

			if (response.ok && (result?.type === 'redirect' || result?.type === 'success')) {
				await drop(log.id);
				sent += 1;
			} else if (result?.type === 'failure' || (response.status >= 400 && response.status < 500)) {
				// The server rejected the log itself; retrying cannot help.
				console.error('queued log rejected:', response.status, log.typeId);
				await drop(log.id);
			} else if (log.attempts + 1 >= MAX_ATTEMPTS) {
				console.error('queued log giving up after retries:', log.typeId);
				await drop(log.id);
			} else {
				await bumpAttempts(log);
			}
		}
	} finally {
		offlineQueue.sending = false;
	}

	return sent;
}
