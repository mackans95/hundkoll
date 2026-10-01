# Plan 18 — Hundkoll as an Android app

> Source: asked 2026-10-01 — "I would like to be able to build this into a fully 'native'
> app, at least for Android, that I can then side-load onto my phone, bypassing the Google
> Play Store. This is to make it easier for other features later, but also make sure things
> feel more native and is not relying on a chrome-window … I don't know much about native
> development, or how it works with SvelteKit."

> **Status: ✅ Phase 1 built** — the Android PR, plus PR #49 for the service-worker fix
> below. Option A, app id `se.hundkoll.app`, PWA kept, the partner's phone later. Verified
> on the phone: icon and splash, nav clear of the system bars in both themes, Back, the
> login surviving repeated swipe-aways, the queue sending the moment airplane mode goes
> off, and a cold offline launch with every tab working (against a local preview until #49
> deploys). WebView debugging is off unless built with `CAP_WEBVIEW_DEBUG=1`. Departures
> and findings:
>
> - **Java 21** was needed besides Android Studio, whose bundled Java 25 is too new for
>   Capacitor 8's Gradle 8.14 (`Unsupported class file major version 69`).
> - **The icon** is hand-written vector drawables from `static/icon.svg`, not
>   `@capacitor/assets`, which saved a dependency.
> - **Back** is a callback in `MainActivity`, not `@capacitor/app`: the plugin, with no JS
>   listener, does nothing at all on the first page instead of leaving the app.
> - **The login was lost on a swipe-away**: the WebView writes cookies to disk on a timer.
>   `MainActivity` flushes them on pause.
> - **The queue waited for a resume to send**: the WebView only fires `online`/`offline`
>   when the app holds `ACCESS_NETWORK_STATE`.
> - **No `server.errorPath`**: offline, the worker tries the network before its cache, the
>   WebView reports that failed try as a main-frame error, and Capacitor left a page the
>   worker was already serving. Without it, a cold offline launch opens from cache.
> - **A pre-existing PWA bug, found here**: SvelteKit sends `private, no-store` on every
>   `__data.json`, and the worker refused to cache anything `no-store` (commit `6e8ca32`),
>   so no page data was ever cached and offline navigation died on the first tap. The
>   server now marks a holed page with `x-hundkoll-incomplete` instead. Verified in the app
>   against a local preview; it reaches production only on merge.
> - **Tested offline without touching the phone's settings**: an APK against a local
>   `vite preview` over `adb reverse`, then stopping the preview. README, "Android app".

## The goal

An icon on the phone that opens Hundkoll as its own app: no browser UI, no Chrome tab
in the app switcher, its own splash screen and status bar. Installed from the Mac without
Play Store. It should also be a base that later features can use for things a web page
cannot do (notifications, widgets, background location, and so on).

And the things that work today must keep working: logging offline, the queue that sends
later, the two phones seeing the same data, and the web version for anyone not on the app.

## What "native" can mean, and which one this is

There are four ways to put a web app like this on Android. They differ mostly in how much
of the existing code survives.

| Approach                            | What it is                                                                                | Verdict                                                                                                                                                                           |
| ----------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TWA** (Bubblewrap)                | An APK that opens the site in Chrome, full screen                                         | ✗ This is the "Chrome window" itself, just without the address bar. No native APIs.                                                                                               |
| **Capacitor**                       | A real Android app (Java/Kotlin shell) with a system WebView inside, plus a plugin bridge | ✓ **Recommended.** Keeps all the Svelte code and adds a native side that plugins and later Kotlin code live in.                                                                   |
| **Tauri 2 mobile**                  | The same idea as Capacitor, with a Rust shell                                             | ✗ Works, but the mobile plugin ecosystem is thinner, and Rust adds a third language for nothing this app needs.                                                                   |
| **Fully native** (Kotlin + Compose) | Rewrite every screen in Kotlin                                                            | ✗ Throws away about 17 plans' worth of UI and logic, and the web version would then be a second app to maintain. Only worth it if the UI itself has to be native, and it doesn't. |

**Capacitor is what "native app from SvelteKit" usually means**, and it's the right fit:
the result is an installed APK with its own process, icon and lifecycle. Inside it the UI
is rendered by Android's **system WebView**, an embedded engine and not the Chrome app.
No browser chrome, no Chrome tab. Anything that has to be truly native (a home-screen
widget, a foreground service for a walk timer) is Kotlin code in the same project,
talking to the page through the bridge.

## What is already there, and constrains the design

- **The app is server-rendered, not a static site.** Every page has a `+page.server.ts`;
  `hooks.server.ts` builds a Supabase client from **cookies** and guards every route;
  logging is a form action. About 1,300 lines live in `$lib/server/` and the route servers.
  Capacitor normally wants a folder of static files to bundle into the APK, and this app
  doesn't have one. **This is the decision the whole plan hangs on** (next section).
- **Offline already works, through a service worker.** Precached bundles, last-good pages,
  and the IndexedDB queue in `$lib/offline/`. Android's WebView supports service workers,
  IndexedDB and localStorage, so this machinery carries over if the app keeps loading the
  site. If the app bundles its own files instead, the worker has nothing left to do and
  offline needs a new design.
- **Auth is cookies set by the server** (`@supabase/ssr`). A WebView has its own cookie
  store that persists between launches, so a login made inside the app stays logged in. It
  is _separate_ from Chrome's, so the first launch asks for the password once.
- **The safe-area handling is already there.** `viewport-fit=cover` and
  `env(safe-area-inset-*)` in `layout.css` drive the nav and top inset. Capacitor 8
  dropped its old margin hack in favour of exactly this (its SystemBars plugin feeds the
  insets to CSS), so the layout should be close to right on day one. Edge-to-edge is
  mandatory on Android 16 at target SDK 36, which Capacitor 8 targets.
- **`theme-color` metas do nothing in a WebView.** The status bar colour and icon contrast
  have to be set from the native side, and switch with the app's theme.
- **"No runtime dependencies beyond supabase"** is a stated README rule. Phase 1 needs
  none: Capacitor is devDependencies plus an `android/` folder. Calling a plugin from
  Svelte (phase 2) needs `@capacitor/core` and the plugin's JS package as real
  dependencies, and that rule gets an amendment.
- **Nothing for Android is installed on this Mac.** No JDK (`java -version` fails), no
  Android SDK, no `adb`. Node is 24, above Capacitor 8's minimum of 22.

## The decision: load the site, or bundle the app

### Option A — the shell loads the deployed site (recommended for now)

`capacitor.config.ts` sets `server.url` to the Vercel deployment. The APK holds the native
shell, icon and splash screen; the WebView opens the real site, and the native bridge is
injected into it, so plugins work.

- **Zero changes to how the app works.** SSR, form actions, cookies, the service worker,
  the offline queue: all as today. The only code change is in the shell.
- **Web deploys update the app instantly.** Merge, Vercel deploys, and the next launch
  has it. A new APK is only needed when the _native_ side changes (a new plugin, an
  icon, a permission). That's rare, which matters because every APK install is a manual
  step from the Mac.
- **Offline cold start still works**, because the service worker answers `/` from cache
  as it does for the PWA. This is the claim most worth verifying (see Definition of done).
- **Cost:** a launch with no cache and no network shows the offline page, exactly as the
  PWA does today. Capacitor's docs label `server.url` "not intended for production". The
  reason is app-store review and the risk of a remote page driving native APIs. Neither
  applies to a sideloaded app pointing at our own domain, but it's still worth knowing
  that we're off the beaten path.

### Option B — bundle the app into the APK

Switch to `adapter-static` in SPA mode, move every `+page.server.ts` load and action into
client-side Supabase calls (safe, because RLS is already the real authorisation; the README
says so), and switch auth from cookies to supabase-js's own storage.

- **Instant launch and true offline-first**: the UI is on the device.
- **Cost:** a rewrite of the data layer and auth, and the service worker and `catchUp.ts`
  freshness logic replaced. The web version then becomes either the same SPA on Vercel
  (losing SSR) or a second build target. Every UI change also needs a new APK, unless we
  add a live-update service, which is another moving part.

Option B is a plan in its own right, roughly the size of plans 1–3 together. **Nothing in
A blocks B later**: the `android/` project, the signing key, the icon, the plugins and the
install routine all carry over unchanged. So: **A now, B only if A's launch speed or
offline start turns out to annoy in practice.** No feature on the horizon needs B; plugins
work the same either way.

## Notifications and a widget: do they need Option B?

> Added 2026-10-01, after question 1 was answered: **notifications and a home-screen
> widget** are the two features this is for.

My first answer said a widget is "where B would start to pay off". After working through
both features end to end, **neither one needs B.** Both mostly live in places A and B
share: Supabase on the server side, and Kotlin in `android/` on the phone. Neither one runs
in the WebView, so it doesn't matter where the WebView's pages come from.

### Notifications run on the server

The reminder that matters is "no walk for six hours". It has to be right even when the
_other_ phone logged the walk. A reminder scheduled on this phone can't know that, so the
check has to run where all logs land:

```
pg_cron (every 15 min) → Edge Function → reads dog_care_status → FCM → phone
events insert trigger  → Edge Function → "Partner loggade en promenad" → FCM → phone
```

- **Firebase Cloud Messaging** (free) delivers to Android. That means a Firebase project,
  `google-services.json` in `android/`, and a service-account secret in Supabase.
- **`@capacitor/push-notifications`** asks for permission (Android 13+), hands the page a
  device token, and opens the right screen when a notification is tapped.
- **A `push_tokens` table** (user, token, platform) with RLS and explicit grants
  (plan 13), written by the page after login.
- **The Edge Function and pg_cron are new Supabase pieces.** The local stack disabled
  `edge_runtime` in plan 9, so that comes back on.

None of it depends on where the app's pages come from. The page registers its token
through the plugin in the same way under A and B.

### The widget is Kotlin whichever way

An Android widget can't show a WebView. It's a small native view (Jetpack Glance) drawn
by the launcher, written in Kotlin inside `android/`. It needs **data** and **actions**:

- **Data: the push that drives notifications also drives the widget.** The same Edge
  Function sends a silent data message with a status snapshot ("Promenad 2 h sedan ·
  Matning om 1 h") whenever an event lands, and the widget redraws from the last one it
  got. So the widget needs **no login of its own** and no polling, and it's fresh within
  seconds of either phone logging. Between pushes, "2 h sedan" is computed on the phone
  from the timestamp.
- **Actions: tapping opens the app at the right dialog** via a deep link
  (`hundkoll://log/walk`), which opens the dialog on Logga. No auth in Kotlin either.
- **One-tap logging straight from the widget, without opening the app**, is the one case
  that needs Kotlin to write to Supabase itself, so it needs a session of its own. It is
  the same work under A and B, and it has a trap: **Supabase refresh tokens rotate, and a
  token reused more than 10 seconds after it was replaced revokes the whole session.** If
  the WebView and Kotlin share one session and both refresh it, they log each other out
  at random. The safe design is a **separate session for the native side**, made with
  the same password at login and kept in encrypted storage. Supabase allows unlimited
  sessions per user. That design belongs in the widget's own plan, and I'd start without
  it.

### So what would B actually buy?

Launch speed, and starting the app with no cache and no signal. Both are real, but small
for an app opened in the hallway with a phone that has signal. Against that, B costs:

- the data-layer rewrite;
- a redesign of offline: the service worker caches page data today, and under B the data
  would come straight from Supabase, which the worker doesn't touch;
- a new APK for every UI change.

**Recommendation: A stays the start.** The order becomes shell → notifications → widget,
each its own plan and PR. B stays possible later, and nothing built for the two features
would have to be redone if it comes.

## Design (Option A)

### Phase 0 — the toolchain, once, on the Mac

- **Android Studio** (Otter 2025.2.1 or newer, which Capacitor 8 requires). Easiest because
  it brings the correct JDK, the SDK and the platform tools (`adb`) in one install. After
  setup it is only needed for the SDK manager and the occasional log viewer. Builds run
  from the terminal with Gradle.
  _Alternative:_ `brew install openjdk@21` plus the `android-commandlinetools` cask. Lighter,
  but more steps that can fail.
- `ANDROID_HOME` and `platform-tools` on `PATH` in `~/.zshrc`, so `adb` works from the
  terminal.
- On the phone: **Developer options → USB debugging** (or Wireless debugging, which pairs
  over Wi-Fi with no cable). This replaces the "install unknown apps" route from the
  question. See [Installing](#installing-and-why-not-the-apk-file-route).

### Phase 1 — the shell (the part that answers the question)

1. `npm i -D @capacitor/cli @capacitor/core @capacitor/android`, then `npx cap init` with
   app id **`se.hundkoll.app`** (permanent: Android identifies the app by it, and changing
   it later means a new app with an empty WebView, so a new login and an empty queue).
2. `capacitor.config.ts`:
   - `server.url`: the production domain; `server.allowNavigation` limited to it.
   - `webDir`: a tiny folder holding just the offline fallback, since Capacitor insists on
     one. It's only shown if the shell can't reach the site at all.
   - Android user agent suffix (`appendUserAgent: 'HundkollApp'`), so the server and
     the page can tell they are inside the app without any JS dependency.
3. `npx cap add android` creates `android/`, a normal Gradle project. **Committed**, as
   Capacitor intends: it's source code (manifest, icon, theme), not build output.
   `android/app/build/`, `.gradle/` and `local.properties` are ignored by the generated
   `.gitignore`.
4. **Icon and splash** from `static/icon.svg` via `@capacitor/assets` (dev dependency),
   producing adaptive icons in the emerald / `#0b0f1a` pair the PWA already uses.
5. **Status bar and system bars** follow the theme: light status bar icons on dark,
   dark on light, with the page painting behind them edge-to-edge. Native default is
   "follow the system". Following the _in-app_ override (`hundkoll:theme`) needs one
   plugin call, so it lands in phase 2.
6. **The hardware back button** goes back in WebView history and closes the app at the
   root, which is Capacitor's default. Closing an open sheet on back instead of leaving
   the page is a phase 2 nicety.
7. **WebView feel**, all CSS behind the user-agent check or harmless on the web:
   `-webkit-tap-highlight-color: transparent`, no long-press callout on buttons,
   `overscroll-behavior` checked. The WebView has no pull-to-refresh, which is fine since
   `catchUp.ts` already refreshes on resume.
8. **Signing.** A release keystore made once with `keytool`, stored **outside the repo**
   (and backed up, e.g. in a password manager). Gradle reads its path and passwords from
   `~/.gradle/gradle.properties`, never from the repo. **If this key is lost, no future APK
   can install over the current one.** Android would demand an uninstall, which wipes the
   login, the theme choice and any unsent queue.
9. **npm scripts**:

   | Script                    | Does                                                           |
   | ------------------------- | -------------------------------------------------------------- |
   | `npm run android:sync`    | `cap sync android`: copies config and plugins into `android/`  |
   | `npm run android:build`   | sync, then `./gradlew assembleRelease`: a signed APK           |
   | `npm run android:install` | `adb install -r` the APK onto the connected phone (keeps data) |

   The APK lands in `android/app/build/outputs/apk/release/`. An AAB (the other format in
   the question) is only for Play Store uploads, so we never need one.

### Phase 2 — making it feel native (only after phase 1 is in daily use)

Each item is small and earns its own PR. Each adds a plugin, so each is one APK install:

- `@capacitor/status-bar` + the theme toggle: status bar follows the in-app override.
- `@capacitor/app`: back closes the open sheet first; `appStateChange` replaces the
  `visibilitychange` resume signal in `catchUp.ts`, which is more reliable in a WebView.
- `@capacitor/haptics`: a tick on Spara, the way native apps confirm.
- `@capacitor/splash-screen`: held until the first paint, so there's no white flash.

All of them sit behind one tiny `$lib/native.ts` (`isNative()`, plus no-op fallbacks), so
the web version never imports a plugin it can't use. Plugin JS loads only inside the app.

### What does not change

The routes, the database, the migrations, Vercel, the PWA install for anyone using the
browser, the offline queue, the tests. The web app does not learn it is in an app until
phase 2, and even then only behind `isNative()`.

## Installing, and why not the APK-file route

The route from the question (copy the APK over, allow "install unknown apps", tap it) works
today, but it's the route Google is closing. **Android developer verification** is rolling
out: from 30 September 2026 in Brazil, Indonesia, Singapore and Thailand, globally from 2027. After that, a tapped APK from an unregistered developer needs either a registered
developer account or a deliberately slow "advanced flow". Sweden isn't affected yet.

**`adb install` is explicitly exempt**, so it's the primary route:

```sh
npm run android:build && npm run android:install   # phone on USB or wireless debugging
```

It's also faster (no file shuffling) and `-r` updates in place, keeping the login and
queue. If installing _without_ the Mac ever matters (the partner's phone, say), Google's
free **limited distribution** developer account (email only, no fee, up to 20 devices)
registers the signing key so a tapped APK installs normally even after enforcement.
Worth knowing about, not worth doing now.

## Files

| File                      | Change                                                                         |
| ------------------------- | ------------------------------------------------------------------------------ |
| `package.json`            | three Capacitor dev deps, `@capacitor/assets`, the three `android:*` scripts   |
| `capacitor.config.ts`     | new: app id, `server.url`, allowed navigation, user agent suffix               |
| `android/`                | new, generated, committed: Gradle project, manifest, icon, theme, signing hook |
| `native-shell/index.html` | new: the `webDir` fallback page, Swedish, mirrors the worker's offline page    |
| `src/routes/layout.css`   | WebView touch tweaks, if the probe shows any are needed                        |
| `.prettierignore`         | `android/`                                                                     |
| `README.md`               | an "Android app" section: toolchain, signing key, build, install, and why A    |

No migration, no runtime dependency, no change under `src/lib/` in phase 1.

## Order of work

1. Phase 0 on the Mac: Android Studio, `adb devices` sees the phone. _(Marcus, a wizard
   can walk it.)_
2. Capacitor init + `android/`, pointed at production; a **debug** APK installed. This is
   the first point where it can be judged on the phone.
3. Icon, splash, system bars, back button: on-device check.
4. Release keystore + signed build + `android:install` (verify `-r` keeps the login).
5. README section, PR. _(Branch + PR, Marcus merges, per the usual.)_
6. Live with it for a while; phase 2 items as separate PRs, in whatever order annoys first.

## Definition of done (phase 1)

- The app installs via `adb`, has its own icon and name, and shows no browser UI anywhere.
- Logging in once survives closing the app, rebooting the phone and reinstalling with `-r`.
- **Airplane mode, then a cold start, opens the log page**, and a log made there sends
  when the network returns. This is the claim Option A rests on.
- The bottom nav sits above the gesture bar and nothing hides under the status bar, in
  both themes.
- Back goes back; back on Logga leaves the app.
- `npm run check`, `npm test`, `npm run lint` still pass; the web app is unchanged in a
  browser.

## Questions

1. **Which "other features later"?** _Answered:_ notifications and a home-screen widget.
   See [Notifications and a widget](#notifications-and-a-widget-do-they-need-option-b):
   both are server + Kotlin work and don't need Option B.
2. **Option A (load the site) to start?** _Recommendation: still yes_, now with the two
   features worked through. B stays possible later.
3. **Android Studio, or command-line tools only?** _Recommendation: Android Studio._ One
   install, the right JDK, and a log viewer for when something misbehaves on the phone.
4. **The partner's phone: Android or iPhone, and should it get the app too?** Android
   is the same APK and a second `adb install`. iPhone means a Mac with Xcode plus either
   a $99/year Apple developer account or re-signing every 7 days, which is a different
   plan entirely. _Recommendation:_ Android-only now; the PWA stays for an iPhone.
5. **App id `se.hundkoll.app`?** It's permanent. Any reverse-domain string works, and no
   domain has to be owned.
6. **Keep the PWA install path for the web?** _Recommendation: yes_, it costs nothing and
   it's the fallback if the APK ever breaks.

## Not in scope

- Play Store publishing, AABs, store listings.
- iOS.
- Option B (the bundled SPA) and any change to how data is loaded.
- Any phase 2 plugin; each one is its own small PR after phase 1 is in daily use.
- Notifications and the widget: their own plans (19 and 20), designed in outline above.
- Background location.

## Sources

- [Capacitor 8 upgrade guide](https://capacitorjs.com/docs/updating/8-0): Node 22,
  Android Studio Otter, SDK 24/36, SystemBars replacing `adjustMarginsForEdgeToEdge`
- [Capacitor config reference](https://capacitorjs.com/docs/config): `server.url` and
  its "not intended for production" note
- [Capacitor environment setup](https://capacitorjs.com/docs/getting-started/environment-setup)
- [Android developer verification rollout (Android Developers Blog, March 2026)](https://android-developers.googleblog.com/2026/03/android-developer-verification-rolling-out-to-all-developers.html):
  timeline, limited distribution accounts, ADB exemption
