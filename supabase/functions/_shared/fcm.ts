// Sends through Firebase Cloud Messaging's HTTP v1 API, signed with the
// service account in the FCM_SERVICE_ACCOUNT secret. WebCrypto only, so no
// Google SDK: the API is one OAuth exchange and one POST.

type ServiceAccount = { project_id: string; client_email: string; private_key: string };

export type Push = { title: string; body: string; tag: string; url: string };
export type SendResult = 'sent' | 'unregistered' | 'failed';

let cached: { token: string; expires: number } | null = null;

function base64url(bytes: Uint8Array | string): string {
	const raw = typeof bytes === 'string' ? bytes : String.fromCharCode(...bytes);
	return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function accessToken(account: ServiceAccount): Promise<string> {
	const now = Math.floor(Date.now() / 1000);
	// Google's tokens last an hour; renew with a minute to spare.
	if (cached && cached.expires > now + 60) {
		return cached.token;
	}

	const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
	const claims = base64url(
		JSON.stringify({
			iss: account.client_email,
			scope: 'https://www.googleapis.com/auth/firebase.messaging',
			aud: 'https://oauth2.googleapis.com/token',
			iat: now,
			exp: now + 3600
		})
	);
	const pem = account.private_key.replace(/-----[^-]+-----|\s/g, '');
	const key = await crypto.subtle.importKey(
		'pkcs8',
		Uint8Array.from(atob(pem), (c) => c.charCodeAt(0)),
		{ name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
		false,
		['sign']
	);
	const signature = await crypto.subtle.sign(
		'RSASSA-PKCS1-v1_5',
		key,
		new TextEncoder().encode(`${header}.${claims}`)
	);

	const response = await fetch('https://oauth2.googleapis.com/token', {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
			assertion: `${header}.${claims}.${base64url(new Uint8Array(signature))}`
		})
	});
	if (!response.ok) {
		throw new Error(`FCM auth failed: ${response.status} ${await response.text()}`);
	}
	const { access_token, expires_in } = await response.json();
	cached = { token: access_token, expires: now + expires_in };
	return access_token;
}

/** Sends one notification to one phone. `tag` makes a newer one replace it in the tray. */
export async function send(raw: string, token: string, push: Push): Promise<SendResult> {
	const account: ServiceAccount = JSON.parse(raw);
	const response = await fetch(
		`https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`,
		{
			method: 'POST',
			headers: {
				authorization: `Bearer ${await accessToken(account)}`,
				'content-type': 'application/json'
			},
			body: JSON.stringify({
				message: {
					token,
					notification: { title: push.title, body: push.body },
					data: { url: push.url },
					android: {
						priority: 'high',
						notification: { channel_id: 'reminders', tag: push.tag, icon: 'ic_stat_paw' }
					}
				}
			})
		}
	);
	if (response.ok) {
		return 'sent';
	}
	const text = await response.text();
	// A token for an uninstalled app, or a phone that cleared the app's data.
	// The caller deletes the row, so say which and why: a quiet delete once
	// cost a reminder with nothing left to explain it.
	if (response.status === 404 || text.includes('UNREGISTERED')) {
		console.warn('FCM token unregistered, dropping:', token.slice(0, 12), response.status, text);
		return 'unregistered';
	}
	console.error('FCM send failed:', response.status, text);
	return 'failed';
}
