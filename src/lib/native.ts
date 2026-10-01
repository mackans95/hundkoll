// The Android app's native side (plan 18), reached only inside the app. The
// push plugin is imported on demand, so a browser never downloads it.

import { goto } from '$app/navigation';
import * as locale from '$lib/locale';

/** Set by capacitor.config.ts's appendUserAgent. */
export function isNativeApp(): boolean {
	return typeof navigator !== 'undefined' && navigator.userAgent.includes('HundkollApp');
}

// The switch is per phone, so its state is device-local; the token is kept to
// remove this phone's row when it is switched off.
const WANTED = 'hundkoll:push';
const TOKEN = 'hundkoll:push-token';

export function pushWanted(): boolean {
	return localStorage.getItem(WANTED) === 'on';
}

// Wrapped: the plugin proxy answers any property as a native method, `then`
// included, so resolving a promise with it bare throws "then() is not implemented".
async function plugin() {
	return { push: (await import('@capacitor/push-notifications')).PushNotifications };
}

type Plugin = Awaited<ReturnType<typeof plugin>>['push'];

/** Asks FCM for this phone's address. Null if it will not say within 15 s. */
async function register(push: Plugin): Promise<string | null> {
	const handles: { remove: () => Promise<void> }[] = [];
	const token = await new Promise<string | null>((resolve) => {
		setTimeout(() => resolve(null), 15_000);
		void push.addListener('registration', (t) => resolve(t.value)).then((h) => handles.push(h));
		void push.addListener('registrationError', () => resolve(null)).then((h) => handles.push(h));
		void push.register();
	});
	await Promise.all(handles.map((h) => h.remove()));
	return token;
}

async function storeToken(token: string, method: 'POST' | 'DELETE'): Promise<boolean> {
	try {
		const response = await fetch('/push', {
			method,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ token })
		});
		// A lapsed session answers with the login page, which is not a yes.
		return response.ok && !response.redirected;
	} catch {
		return false;
	}
}

export type PushOutcome = 'on' | 'denied' | 'failed';

/** The switch going on: Android's permission, then FCM, then the server. */
export async function enablePush(): Promise<PushOutcome> {
	const { push } = await plugin();
	let permission = await push.checkPermissions();
	if (permission.receive.startsWith('prompt')) {
		permission = await push.requestPermissions();
	}
	if (permission.receive !== 'granted') {
		return 'denied';
	}

	await push.createChannel({ id: 'reminders', name: locale.settings.push.channel, importance: 4 });
	const token = await register(push);
	if (!token || !(await storeToken(token, 'POST'))) {
		return 'failed';
	}
	localStorage.setItem(WANTED, 'on');
	localStorage.setItem(TOKEN, token);
	return 'on';
}

export async function disablePush(): Promise<void> {
	const token = localStorage.getItem(TOKEN);
	localStorage.removeItem(WANTED);
	localStorage.removeItem(TOKEN);
	if (token) {
		await storeToken(token, 'DELETE');
	}
	await (await plugin()).push.unregister();
}

/**
 * Every launch with the switch on: FCM rotates tokens, and the server forgets
 * one it is told is dead. A permission taken back in Android turns the switch off.
 */
export async function refreshPush(): Promise<void> {
	const { push } = await plugin();
	if ((await push.checkPermissions()).receive !== 'granted') {
		localStorage.removeItem(WANTED);
		return;
	}
	const token = await register(push);
	if (token && (await storeToken(token, 'POST'))) {
		localStorage.setItem(TOKEN, token);
	}
}

/** A tap on a reminder opens the screen it names. */
export async function listenForTaps(): Promise<void> {
	const { push } = await plugin();
	await push.addListener('pushNotificationActionPerformed', ({ notification }) => {
		const url = notification.data?.url;
		if (typeof url === 'string' && url.startsWith('/')) {
			void goto(url);
		}
	});
}

/** Logging a type on this phone makes its reminder in the tray stale. */
export async function clearReminder(typeId: string): Promise<void> {
	if (!isNativeApp()) {
		return;
	}
	const { push } = await plugin();
	const { notifications } = await push.getDeliveredNotifications();
	const stale = notifications.filter((n) => n.tag === typeId);
	if (stale.length > 0) {
		await push.removeDeliveredNotifications({ notifications: stale });
	}
}
