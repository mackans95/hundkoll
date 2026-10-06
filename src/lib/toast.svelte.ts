// One short confirmation at a time, drawn by Toaster in the layout. A save
// shows it in place of reloading onto a banner, so the page keeps its scroll.

import type { SubmitFunction } from '@sveltejs/kit';
import * as locale from '$lib/locale';

const SHOW_MS = 3000;

export const toast = $state<{ message: string | null }>({ message: null });

let timer: ReturnType<typeof setTimeout> | undefined;

export function showToast(message: string): void {
	toast.message = message;
	clearTimeout(timer);
	timer = setTimeout(() => (toast.message = null), SHOW_MS);
}

/**
 * For `use:enhance` on a settings form whose action returns `{ saved: true }`:
 * toasts "Sparat!" and refreshes the data without moving the page. The form
 * keeps what was typed, since it now matches what was stored.
 */
export const savedToast: SubmitFunction = () => {
	return async ({ result, update }) => {
		await update({ reset: false });
		if (result.type === 'success' && result.data?.saved) {
			showToast(locale.settings.saved);
		}
	};
};
