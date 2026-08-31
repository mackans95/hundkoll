// Whether a page's reads all landed, and what to do when they did not.

/**
 * A page with a hole in it must not become the copy the service worker serves
 * on the next launch — the hole would look permanent, and only a manual reload
 * would clear it. That is one bad moment turning into a broken app.
 *
 * Every read that can fail returns null rather than an empty list, so this only
 * has to look for nulls. Pass all of them: the guard used to ask about one read
 * per page, and the reads it did not ask about were cached with their holes.
 *
 * Returns whether anything failed, which is also what the page hands its
 * components so an unreadable list reads as unreadable rather than as empty.
 */
export function readsFailed(
	setHeaders: (headers: Record<string, string>) => void,
	...reads: unknown[]
): boolean {
	const failed = reads.some((read) => read === null);
	if (failed) {
		setHeaders({ 'cache-control': 'no-store' });
	}
	return failed;
}
