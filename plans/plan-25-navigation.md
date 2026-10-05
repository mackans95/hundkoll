# Plan 25 — A menu for Settings, and Trender on its own

> Source, 2026-10-05: "add a hamburger menu to house the Settings, and also move Trends to its
> own separate view; this would give you a quick overview of just the trends without all the
> other statistics. The Settings option within the hamburger menu could serve as a main menu
> that expands to reveal the various sub-menus — such as 'Intervaller / Spårning',
> 'Tabeller', 'Trender' and 'Utseende'."

> **Status: ✅ Built, awaiting merge** — branch `feature/navigation-menu`. The structure
> plans 26–29 build on: it moves what exists and adds no settings of its own. Six questions
> answered before code (below); two departures from my recommendations, both Marcus's call.
> Verified in headless Chrome on the local stack:
>
> - the four tabs, Trender's period tabs, and no trend card left on Statistik;
> - ☰ opening, and closing by Back, by a tap outside, and by ☰ again, the URL unchanged;
> - an entry navigating with the menu closed, and Back landing on the page it opened on;
> - `/settings` redirecting, Spara showing "Sparat!", Tema switching, Logga ut;
> - no exceptions.
>
> **Not yet checked on the phone:** the Back gesture. It walks the same WebView history the
> probe's `history.back()` does, but it hasn't been tried.
>
> One departure from the design: **picking an entry pops the menu's entry and then
> navigates**, rather than replacing it with `data-sveltekit-replacestate`. A replaced entry
> keeps its navigation index, the same as the page underneath, so SvelteKit took Back from the
> sub-page for a shallow step: the URL changed and the page didn't.

## The goal

```
┌──────────────────────────── ☰ ┐      ☰ drops down Inställningar:
│ Statistik                      │            Intervaller · Utseende
│ …                              │            Aviseringar (in the app only)
│                                │            Tabeller · Trender (stubs)
├───────┬───────┬────────┬───────┤            Logga ut
│ Logga │Status │Statistik│Trender│
└───────┴───────┴────────┴───────┘
```

Trender is one tap from anywhere, without scrolling past the rest of Statistik. Settings
leave the bottom bar for a menu that has room to grow.

## What is already there, and constrains the design

- **The bottom bar** is a list in `+layout.svelte` (`tabs`), labels in `locale.nav`. A tab
  is selected by exact pathname.
- **Trender** is `TrendCard` at the top of `/stats`, fed by `loadStats` with `?trend=`.
  Its two reads (`stats_type_buckets` and `stats_detail_buckets` at the trend period) are
  independent of the other eleven.
- **`/settings`** is one page: the interval form (`?/save`, redirecting to `?saved`),
  Aviseringar (native only, decided after mount), Tema (localStorage), and Logga ut
  (`?/logout`).
- **The Back gesture in the Capacitor app walks WebView history**, so each place in the
  menu has to be a real navigation, not a panel opened by script.
- **Nothing works only with JavaScript.** Forms post, tabs are links.
- **Marcus is red-green colour-blind:** "where am I" is shown by a fill and weight, not a hue.

## Decided

Asked 2026-10-05, before any code.

| Question                        | Answer                                                                                                                                                   |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| What's in the bottom bar?       | **Logga · Status · Statistik · Trender** (🐾 ⏱️ 📊 📈).                                                                                                  |
| Where does ☰ live, and how?    | **Top-right on every signed-in page, as a `<details>` dropdown**, and "Back DOES close the dropdown, if possible". (Recommended: a link to a menu page.) |
| Historik into the menu?         | **No**, it stays on Logga's recent events.                                                                                                               |
| Sub-pages: routes or sections?  | **Routes.**                                                                                                                                              |
| Stubs for Tabeller and Trender? | **Stubs now.** (Recommended: none until filled.)                                                                                                         |
| The interval entry's name       | **"Intervaller"** until plan 26 adds the tracking choices.                                                                                               |

## Design

### Trender, its own route

- **`/trends`** renders `TrendCard` exactly as today, under a "Trender" heading, with
  `?period=` choosing the period.
- **`loadTrends(db, period)`** is split out of `loadStats`: the two trend reads and
  `trendBuckets`. `loadStats` loses its `trend` argument and the `trend*` fields, so
  Statistik makes two reads fewer.
- Statistik's accident tab bar keeps `?period=`, now alone in the URL.

### The menu

```
                         ☰
            ┌──────────────────┐
            │ INSTÄLLNINGAR    │
            │ ⏰ Intervaller    │
            │ 🎨 Utseende       │
            │ 🔔 Aviseringar    │  (in the app only)
            │ 📋 Tabeller       │  (stub, plan 28–29)
            │ 📈 Trender        │  (stub, plan 27)
            │ ──────────────── │
            │ Logga ut         │
            └──────────────────┘
```

- **☰ is the `<summary>` of a `<details>`** drawn once by the layout, at the top right of
  the page column, over the page's own header so no page gains a row. Without JS it still
  opens and closes, and its entries are plain links.
- **Back closes it.** Opening it pushes a shallow-routing entry (`pushState`, with
  `page.state.menuOpen`), and `open` follows that state, so Back pops the entry and the
  menu closes. Tapping ☰ again goes `history.back()` instead of leaving the entry behind.
- **Picking an entry pops that entry first**, then navigates, so Back from a sub-page returns
  to the page the menu was opened on, closed.
- **Tapping outside closes it** too, through a transparent backdrop under the panel.
- The open panel, and ☰ while inside `/settings`, are marked by the selected fill and weight,
  not a hue.
- **Logga ut** is a form posting to `/logout`, an action-only route.

### The sub-pages

- **`/settings`** redirects to `/settings/intervals`, so an old link still lands somewhere.
- **Each sub-page** has a header with its title; the menu is how you move between them.
- **`/settings/intervals`**: the interval form and its `save` action, redirecting to
  `?saved`.
- **`/settings/appearance`**: Tema.
- **`/settings/notifications`**: PushSection. Its entry shows only in the app; visited in
  a browser, the page says notifications live in the app.
- **`/settings/tables`** and **`/settings/trends`**: a line saying what will come there.
- **No tab is selected** in the bottom bar while in settings.

### Verification

- `npm run check`, `npm test`, `npm run lint`, svelte-autofixer on the changed components.
- Headless Chrome: each tab reaches its page; Trender's period tabs; ☰ opens, Back closes
  it; an entry navigates and Back returns to the page with the menu closed; save an interval
  and see "Sparat!"; Tema switching; Logga ut.
- On the phone: the same Back behaviour through the gesture; ☰ clear of the status bar.

## Not in scope

- Anything configurable in Trender or Statistik (plans 27–29), or per-type settings (plan 26).
- Changing what TrendCard shows.
