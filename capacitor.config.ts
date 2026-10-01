import type { CapacitorConfig } from '@capacitor/cli';

// CAP_SERVER_URL=http://127.0.0.1:4173 builds an APK against a local
// `vite preview` reached through `adb reverse` (README, "Android app").
// 127.0.0.1 counts as a secure origin, so the service worker still runs.
const url = process.env.CAP_SERVER_URL ?? 'https://hundkoll.vercel.app';

// The Android app is a native shell around the deployed site, not a bundled
// copy of it: see plans/plan-18-android-app.md for why. Web deploys reach the
// app on its next launch; only changes here or in android/ need a new APK.
//
// No server.errorPath: an offline launch has the service worker try the
// network before its cache, the WebView reports that failed try as a
// main-frame error, and Capacitor would leave a page the worker was serving.
const config: CapacitorConfig = {
	// Permanent: Android identifies the app by it, and a new id is a new app
	// with an empty WebView (logged out, unsent queue gone).
	appId: 'se.hundkoll.app',
	appName: 'Hundkoll',
	// Capacitor requires a local web folder with an index.html even when it
	// loads a URL. Nothing in it is ever shown.
	webDir: 'native-shell',
	server: {
		url,
		cleartext: url.startsWith('http:')
	},
	// Lets the page tell it is inside the app without importing anything.
	appendUserAgent: 'HundkollApp',
	android: {
		// CAP_WEBVIEW_DEBUG=1 builds an APK the Mac can inspect over adb
		// (chrome://inspect). Off otherwise, release builds included.
		webContentsDebuggingEnabled: process.env.CAP_WEBVIEW_DEBUG === '1'
	}
};

export default config;
