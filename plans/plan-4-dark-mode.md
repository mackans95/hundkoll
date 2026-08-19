# Plan 4 — Dark mode

> Source: `new-features.md` § "Implement dark-mode (unsure)"

## Summary

Semantic color tokens via the CSS `light-dark()` function, a three-state
theme setting (System / Ljust / Mörkt) stored per device, and a chart
palette that keeps its **lightness-contrast pairs** — which is what makes
the current charts work for color-blind eyes, and what the dark variants
must preserve. You won't need to pick any colors: this plan names every
value.

## The mechanism: tokens + `light-dark()` (the "why this way")

The app uses literal Tailwind colors (`bg-white`, `text-gray-500`,
`border-gray-200`, …) across ~24 components. Two ways to make that
theme-aware:

1. **`dark:` variants everywhere** — every color class gets a twin
   (`bg-white dark:bg-gray-800`). Incremental, but permanently doubles the
   class soup, and every _future_ component must remember both halves;
   a missed one is invisible until someone toggles. Rejected.
2. **Semantic tokens** — one sweep renames literals to _roles_
   (`bg-surface-raised`, `text-muted`, `border-default`), and each role is
   defined once with a light and a dark value. New components use roles and
   are theme-correct by construction. **Chosen.**

For the definitions, modern CSS has exactly the right primitive:

```css
/* layout.css */
:root { color-scheme: light dark; }            /* follow the system */
:root[data-theme='light'] { color-scheme: light; }
:root[data-theme='dark']  { color-scheme: dark; }

@theme inline {
  --color-surface:        light-dark(var(--color-gray-50),  #0b0f1a);
  --color-surface-raised: light-dark(#ffffff,               var(--color-gray-900));
  ...
}
```

`light-dark(a, b)` resolves per the element's `color-scheme` — so **the
whole theme toggles by setting one attribute on `<html>`**, there is no
duplicated dark block to keep in sync with a media query, and "System"
mode is the zero-code default. Tailwind v4's `@theme inline` maps each
token to a real utility (`bg-surface`, `text-muted`), so templates stay
plain Tailwind. `light-dark()` is supported in all evergreen browsers since
mid-2024 — fine for a two-phone PWA. Bonus: `color-scheme` alone already
fixes native UI (inputs, scrollbars, the `datetime-local` picker) for free.

## The token set (complete inventory → roles)

From a sweep of every color literal in the components:

| Token                              | Light                | Dark                    | Used for (today's literals)                                            |
| ---------------------------------- | -------------------- | ----------------------- | ---------------------------------------------------------------------- |
| `surface`                          | `gray-50`            | `#0b0f1a`               | page body                                                              |
| `surface-raised`                   | `white`              | `gray-900`              | cards, nav, dialog panel                                               |
| `surface-sunken`                   | `gray-50`            | `gray-950`              | foldable headers, stat tiles, tab-bar track                            |
| `surface-hover`                    | `gray-100`           | `gray-800`              | hover/active/hovered-column fills                                      |
| `border-default`                   | `gray-200`           | `gray-800`              | card & nav borders, dividers                                           |
| `border-strong`                    | `gray-300`           | `gray-700`              | inputs, stat tiles                                                     |
| `text-default`                     | `gray-900`           | `gray-100`              | headings, values                                                       |
| `text-muted`                       | `gray-500`           | `gray-400`              | subtitles, axis labels (as `fill-*` too)                               |
| `text-faint`                       | `gray-400`           | `gray-500`              | chart tick text, chevrons                                              |
| `scrim`                            | `black/40`           | `black/60`              | dialog backdrop                                                        |
| `tooltip-surface` / `tooltip-text` | `gray-900` / `white` | `gray-100` / `gray-900` | chart tooltip (inverts in dark: a dark box on a dark chart disappears) |

Status colors (banners, badges) keep hue, flip lightness — e.g.
`bg-red-50 text-red-800` → dark `red-950`/`red-300`; same pattern for
amber, green, emerald (`bg-emerald-100` nav selection → `emerald-950` +
`emerald-200` text). Each becomes a token pair (`status-danger-bg`,
`status-danger-text`, …) so the eight banner/badge sites stop repeating
raw pairs. The category tile colors (emerald/sky/amber-600 with white
text) stay **identical in both themes** — they're saturated mid-tones that
sit fine on dark, and they are the app's identity.

## Charts and color-blindness

The current palette already does the right thing for red-green
color-blindness: pairs differ in **lightness**, not just hue — kiss/bajs is
amber-600 vs amber-800, meals is emerald vs two grays. The dark variants
must keep those lightness _deltas_ while brightening against the dark
surface:

| Constant          | Light (today)                   | Dark                                                    |
| ----------------- | ------------------------------- | ------------------------------------------------------- |
| `WALK_COLOR`      | `#059669`                       | `#34d399` (emerald-400)                                 |
| `WEIGHT_COLOR`    | `#0284c7`                       | `#38bdf8` (sky-400)                                     |
| `ACCIDENT_COLORS` | `#d97706`, `#92400e`, `#9ca3af` | `#fbbf24` (amber-400), `#b45309` (amber-700), `#6b7280` |
| `MEAL_COLORS`     | `#059669`, `#9ca3af`, `#d1d5db` | `#34d399`, `#6b7280`, `#4b5563`                         |
| gridlines         | `#f3f4f6` / `#e5e7eb`           | `gray-800` / `gray-700`                                 |

Mechanically: `palette.ts` stops exporting hex and exports CSS variable
references (`export const WALK_COLOR = 'var(--chart-walk)'`) with the
variables defined next to the other tokens via `light-dark()`. Inline SVG
`fill`/`stroke` and the tooltip/legend `style="background:{color}"` sites
all accept `var()` unchanged — **no chart component edits beyond the two
hardcoded gridline hexes** in `StackedColumns`/`TrendLine`. Verification:
contrast-check every adjacent pair (segment vs segment, line vs surface)
at ≥ 3:1, and screenshot both themes through the CDP probe with a
Deuteranopia filter as a sanity pass.

## The switch

- **Setting:** a three-option segmented control on the settings page —
  `System` (default) / `Ljust` / `Mörkt` — reusing the `TabBar` look but as
  buttons (this is device-local, so it must not navigate). Stored in
  `localStorage` (`hundkoll:theme`), applied as
  `document.documentElement.dataset.theme`; "System" removes the attribute.
  Per-device on purpose: your phone dark, the partner's light.
- **No flash on load (FOUC):** a 4-line inline `<script>` in `app.html`
  `<head>` — before the stylesheet paints — reads localStorage and sets the
  attribute. This is the one place the app runs JS outside Svelte; comment
  accordingly.
- **Browser chrome:** `<meta name="theme-color">` duplicated with
  `media="(prefers-color-scheme: …)"` for System mode, and updated by the
  toggle for explicit modes, so the iOS/Android status bar matches. The
  manifest's `background_color` (splash) stays light — acceptable, noted.

## Changes, file by file

| File                                        | Change                                                                                                                                                       |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/routes/layout.css`                     | `color-scheme` rules, `@theme inline` token block (the tables above), chart variables. The single place both palettes live.                                  |
| ~24 components                              | Mechanical literal→token rename per the inventory table. Zero visual change in light mode — verifiable by pixel-diffing light-mode screenshots before/after. |
| `src/lib/stats/palette.ts`                  | Hex → `var()` references; comment pointing at layout.css.                                                                                                    |
| `StackedColumns.svelte`, `TrendLine.svelte` | The two gridline/baseline hexes → tokens.                                                                                                                    |
| `src/app.html`                              | FOUC script + theme-color metas.                                                                                                                             |
| `src/lib/theme.svelte.ts` **(new)**         | Tiny module: `$state` for the choice, load/apply/persist.                                                                                                    |
| `src/routes/settings/+page.svelte`          | The three-way control.                                                                                                                                       |
| `src/lib/locale.ts`                         | `settings.theme` strings (Tema, System, Ljust, Mörkt).                                                                                                       |
| Service worker                              | No change — CSS handles theming; the offline fallback page gets `color-scheme: light dark` and system colors in its inline styles.                           |

## Sequencing (each step ships alone, light mode never breaks)

1. **Tokenize** — layout.css block + component sweep, light values only.
   Pure rename; pixel-diff to prove nothing moved.
2. **Dark values** — fill in the `light-dark()` seconds; app now follows
   the system setting with no UI.
3. **The switch** — settings control + FOUC script + theme-color metas.
4. **Charts** — palette variables + gridline tokens + contrast pass.

Step 2 alone already delivers "dark mode" for a person whose phone is
always dark — worth knowing given the "(unsure)" in the feature file: you
can stop after step 2 and skip the toggle entirely.

## Pros

- One attribute flip switches everything; impossible to have a
  half-toggled page.
- New components are theme-correct by default — roles, not colors.
- No duplicated dark stylesheet to drift; every pair sits on one line.
- Native form controls, scrollbars and pickers theme for free via
  `color-scheme`.
- All color decisions are made in this plan (with color-blind-safe
  lightness pairs), none deferred to you.

## Cons / trade-offs

- The tokenize sweep touches ~24 files at once — a big-but-mechanical PR
  (mitigated by the pixel-diff proof and by being step 1 in isolation).
- Semantic names add one indirection when reading a template
  (`bg-surface-raised` vs `bg-white`) — the cost of every design-token
  system.
- `light-dark()` requires evergreen browsers (true here; would be the
  wrong call for a public site with old-Android traffic).
- Theme choice is per-device, not per-account — deliberate, matches the
  active-walk decision in Plan 1.

## Open questions

1. Dark `surface`: near-black slate (`#0b0f1a`, calmer, recommended) or
   pure gray-950? Taste; one token.
2. Should the toggle also live somewhere quicker than settings (e.g. the
   nav)? **Default: no** — set once, then System does the work.

## Effort

Medium. Steps 1–2 are one focused evening (mechanical sweep + one CSS
block); steps 3–4 are small. Best done _before_ Plans 1 and 3 add new
components, so those are written token-native — otherwise their surfaces
join the sweep list.
