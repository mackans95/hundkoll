# Plan 6 — A cold open can still land on the old walk dialog

> Source: reported 2026-08-24 — "sometimes when opening the app (so cold open
> without refresh) the walk log shows the old dialog, so it does not start the
> live walk functionality that is now the default".

## Summary

Not the service worker. This is the live walk's own design boundary showing
through: the Promenad tile is a real link to `?detail=walk`, and the live walk
only happens in the `onclick` handler — which does not exist until Svelte has
hydrated. A cold open is exactly when hydration is slowest, so a quick tap
navigates instead, and the server renders the old dialog. There is a second,
independent route to the same screen: an installed PWA restoring the URL it
was closed at.

Fix: when the page loads with `?detail=` naming a **live** type and JavaScript
is running, turn it into a live walk instead of showing the dialog. The no-JS
fallback is untouched, because that is the case where nothing runs to convert
it.

## Why it is not the service worker (checked)

`src/service-worker/index.ts` is sound on exactly this point:

- The cache name is `hundkoll-${version}`, so each build gets its own.
- `install` precaches, then `skipWaiting()`; `activate` deletes every cache
  that is not the current one, then `clients.claim()`. **An old bundle cannot
  outlive its build.**
- Pages are **network-first** — the cached copy is a fallback for a failed
  fetch, not a preference. Online, a cold open gets fresh HTML referencing the
  current hashed assets.

A stale-cache explanation would also predict the live walk being missing
_entirely_, not intermittently, and would not resolve on refresh. So the
report's own detail — "cold open without refresh" — points away from it.

## What is actually happening

`LogGrid` renders each tile as `<a href="?detail={type.id}">` with an
`onclick` that calls `preventDefault()` and starts the live walk. That anchor
is deliberate: it is what makes a tap work before hydration and with no
JavaScript at all, and Plan 1 chose it knowingly ("live mode is a JS-only
enhancement by nature").

The consequence is that there is a window on every cold start — service worker
serving the shell, bundle parsing, hydration pending — in which a tap follows
the href for real. The server then renders `?detail=walk`, which is the
backdating dialog. Nothing is broken; the fallback simply won.

Two things make this land more often than it sounds:

- A cold open is the slowest hydration the app ever has, and the log tile is
  the first thing a thumb reaches for. The tap and the hydration race.
- **An installed PWA can restore the URL it was closed at.** Close the app
  with the dialog open — or with `?detail=walk` still in the URL — and the
  next cold open renders that dialog before any tap happens at all.

## The fix

On mount, if the page arrived with `?detail=<live type>`, convert it:

```ts
// +page.svelte, in the existing onMount
onMount(() => {
	loadActiveWalk();
	// A tap that beat hydration — or a restored URL — landed on the dialog for
	// a type that is meant to log live. Now that JavaScript is running, do
	// what the tap meant: start the walk and drop the parameter.
	if (data.detailType && LIVE_TYPE_IDS.has(data.detailType.id)) {
		startWalk(data.detailType.id);
		urlDialogClosed = true;
		replaceState('/', {});
	}
});
```

`startWalk` already no-ops when a walk is running, so a restored URL over an
active walk simply shows the card. `urlDialogClosed` is the flag the page
already uses to ignore a `?detail=` it has dismissed, so the dialog never
paints.

Ordering note: this must run after `loadActiveWalk()`, or a restored URL would
start a second walk before the stored one is read. The snippet above has that
order; a test on the state module can pin it.

### Alternatives considered

| Option                                                       | Why not                                                                                                                                                                |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Point live tiles at a different href                         | Whatever it points at still renders server-side without JS. Moves the problem, does not remove it.                                                                     |
| Drop the href on live tiles                                  | Kills the no-JS and pre-hydration path outright — the thing the anchor exists for. A tap during the window would then do nothing at all, which is worse than a dialog. |
| Have `?detail=walk` render a "starting…" page                | A server-rendered page cannot start a walk (the walk lives in `localStorage`), so it would be a dead end without JS.                                                   |
| Block taps until hydrated (disable the tile, show a spinner) | Makes every cold open feel slower to protect against a rare mis-landing. The app's whole logging path is built to avoid exactly this kind of wait.                     |
| Accept it                                                    | Defensible — it self-corrects with one Avbryt — but it contradicts "live is the default", which was the point of Plan 1.                                               |

## Changes, file by file

| File                      | Change                                                                                                                                                           |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/routes/+page.svelte` | The conversion above, inside the existing `onMount`, after `loadActiveWalk()`.                                                                                   |
| `tests/`                  | `startWalk` is already covered indirectly; add a case pinning that starting while a walk is active leaves the original untouched (the restored-URL case).        |
| `README.md`               | One line in the offline/installable section: a live type's `?detail=` URL converts itself once JavaScript runs, so the pre-hydration fallback is not a dead end. |

## Verification

Reproduce before fixing, so the fix is known to address the real path:

1. Load the page with `?detail=walk` directly — that is the restored-URL case
   exactly, and needs no timing tricks. Today: the dialog. After: the live
   walk card, URL tidied to `/`.
2. For the race itself, throttle the CPU over CDP (`Emulation.setCPUThrottlingRate`)
   and click the tile before hydration; the navigation should still end on the
   live card.

## Pros

- The default becomes the default in every path that can run JavaScript.
- No-JS behaviour is unchanged, and the anchor keeps doing its job.
- Fixes the restored-URL case, which no amount of hydration speed would have.

## Cons / trade-offs

- A brief flash of the server-rendered dialog is possible before the mount
  converts it. Acceptable, and much shorter than the current state of leaving
  it up; it can be suppressed later by not rendering a live-type `?detail=`
  dialog during hydration at all.
- Anyone who deliberately opens `?detail=walk` for backdating now gets the
  live card instead. That is the intended default, and the card carries
  "Logga i efterhand istället" one tap away.

## Effort

Small — a handful of lines and a test. Worth doing before Plan 5, since it is
the one that changes what the app does by default.
