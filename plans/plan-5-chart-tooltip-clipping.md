# Plan 5 — The chart tooltip gets cut off at the card header

> Source: reported 2026-08-24 — "when hovering over certain staples in the
> charts view (especially on mobile) sometimes the tooltip gets hidden behind
> the header section of that charts card".

> **Status: ✅ Built and shipped** — PR #35: `placeTooltip` in
> `charts/geometry.ts` with the decision unit-tested, `bind:clientHeight` on
> the box, and the vertical clamp. `overflow-hidden` stays, the card stays
> rounded, and nothing about the chart's coordinates leaves the component.
>
> **Deviations from the plan as written:**
>
> - **Three placements, not two.** "Flip below when there is no room above"
>   is wrong for bars around the middle of the plot: an 86px box fits on
>   neither side of a 140px chart, and flipping then clamping dragged the box
>   back _over the bar it describes_ — measured on a bar whose top sat 91.6px
>   down, a fifth of a pixel short of fitting above. The rule is now: above
>   if it fits, below if it fits, otherwise the roomier side with the box
>   pinned inside the plot. That third case covers part of the chart, which
>   is the trade the plan already accepted, and it keeps the box whole.
> - The tooltip is placed in **pixels rather than percent**, so
>   `-translate-y-full` applies only to the bottom-anchored case and the
>   clamped positions can be expressed at all. `StackedColumns` binds
>   `clientHeight` and hands over the bar top in container pixels.
>
> Measured with the same CDP sweep as the investigation, at 430px and 360px,
> over 30 columns spanning 0–10 walks a day. Before: **7 of 30** tooltips cut
> off by the card's top edge, all 30 reaching into the header band. After:
> **0 clipped, 0 in the header, 0 leaving the chart area at all.** Columns
> 0–2 (the short bars) still sit above, so the common case looks exactly as
> it did; 6 of 30 — the mid-height bars — overlap their own bar's top, which
> is the third case above.

## Summary

Real, reproducible, and **not a z-index problem** — so the obvious fix (raise
the z-index) cannot work. The tooltip is clipped by `overflow-hidden` on the
`FoldableCard`, and clipping by an ancestor is unaffected by any z-index the
tooltip carries. The fix is to stop the tooltip needing that space: flip it
_below_ the column when there is not room above.

## What is actually happening (measured, not guessed)

Driven over CDP with your real distribution (~7 walks a day, peaks of 9–10),
hovering all 30 columns of the walk chart at 430px and 360px wide:

| Measurement                              | Value                     |
| ---------------------------------------- | ------------------------- |
| Top of the plot area                     | y = 82                    |
| Bottom of the card header                | y = 66                    |
| **Clearance between them**               | **16px**                  |
| Tooltip height (2-row walk tooltip)      | **86px**                  |
| Columns whose tooltip reaches the header | **20 of 30**              |
| Worst case above the card's top edge     | 13px, cut off             |
| Clipping ancestors found                 | `details overflow:hidden` |
| Competing stacking contexts found        | **none**                  |

Two conclusions follow, and they matter for choosing the fix:

1. **The tooltip already paints _over_ the header.** `z-10` on a positioned
   element beats the static `<summary>`, and the probe found no competing
   stacking context. A screenshot confirms it: the tooltip sits on top of
   "🚶 Promenader", legibly. So "hidden behind the header" is not a paint
   order fight — raising the z-index would change nothing.
2. **What is lost is the part that leaves the card.** `FoldableCard` has
   `overflow-hidden` (it is what keeps the header's square background inside
   the rounded border), so the moment the tooltip extends past the card's top
   edge, that strip is clipped — taking the heading row of the tooltip with
   it.

Why it is the normal case rather than an edge case: the tooltip is anchored
with `-translate-y-full` at the top of the hovered bar, so it needs ~86px of
space above the bar. `niceCeil` puts the axis top at 10 for your data, so
bars routinely stand at 60–100% of the plot — leaving far less than 86px.
**20 of 30 columns** hit it. On a phone it is worse only because the plot is
shorter (the SVG scales with width while the tooltip does not) and because a
touch, unlike a mouse, tends to land on the tall bars you are inspecting.

## The fix: flip below when there is no room above

```svelte
<!-- ColumnTooltip: one more prop and one more class -->
{#if placeBelow}
	style="left: {leftPx}px; top: calc({topPercent}% + 6px)" <!-- no -translate-y-full -->
{:else}
	style="left: {leftPx}px; top: calc({topPercent}% - 6px)" <!-- as today -->
{/if}
```

`StackedColumns` already knows everything needed to decide: it has the
container's height and the bar's top as a percentage. Measure the tooltip
(it already self-measures its width with `bind:clientWidth`; add
`bind:clientHeight`) and flip when `barTopPx < tipHeight + margin`.

This is the standard tooltip behaviour, and it is the right one here:

- Nothing has to escape the card, so `overflow-hidden` stays and the rounded
  corners keep working.
- The flipped position is _into_ the chart, which always has room — the bar
  is tall precisely when the space below its top is large.
- On a phone the tooltip stays above the finger for short bars (the common
  case) and moves below it only for tall ones, where the finger is near the
  top of the card and the space below is free.

Add, for good measure, a clamp so the box can never leave the plot area
vertically — the same defensive shape as the existing horizontal clamp, which
is already written and tested (`leftPx`).

### Alternatives considered

| Option                                                   | Why not                                                                                                                                                                               |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Raise the tooltip's z-index                              | **Cannot work.** Clipping by an ancestor's `overflow` ignores z-index. This is the fix the report asks for, and it is worth saying plainly that it would appear to do nothing.        |
| Drop `overflow-hidden` from `FoldableCard`               | Lets the tooltip spill outside the card, over whatever card sits above it — and the header's square background corners would then poke out past the rounded border. Two new problems. |
| Render the tooltip `fixed`, positioned in viewport space | Escapes every clip and is genuinely robust, but the tooltip then has to track scroll and resize, and the chart's coordinate maths stops being self-contained. Overkill here.          |
| Shrink the tooltip                                       | Treats the symptom, and the emoji count rows are the tooltip's whole value.                                                                                                           |
| Reserve headroom in the plot (cap bars at ~80%)          | Wastes vertical space on every chart forever to serve the hover state, and makes the axis lie about its own scale.                                                                    |

## Changes, file by file

| File                                              | Change                                                                                                                                                           |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/components/charts/ColumnTooltip.svelte`  | `bind:clientHeight`; a `placeBelow` prop that swaps the vertical anchor (and drops `-translate-y-full`); vertical clamp beside the existing horizontal one.      |
| `src/lib/components/charts/StackedColumns.svelte` | Pass the bar's top in pixels (it already computes `tipTop` as a percentage) so the tooltip can decide; nothing else moves.                                       |
| `tests/`                                          | The decision is pure: extract `placeTooltip(barTopPx, tipHeight, plotHeight)` into `charts/geometry.ts` and test it — flips when short of room, stays otherwise. |

No visual change for short bars, which is most of them.

## Pros

- Fixes the reported case and the 19 other columns that share it.
- Keeps `overflow-hidden`, the rounded card, and the self-contained chart
  coordinate system.
- The decision lands in `geometry.ts`, where the rest of the chart's maths is
  already pure and unit-tested.

## Cons / trade-offs

- The tooltip moving between above and below as you sweep across columns is a
  small visual jump. Standard behaviour, but it is a change in feel.
- A flipped tooltip covers the bars below it. Unavoidable for an overlay, and
  it covers chart area rather than the heading.

## Effort

Small. One geometry function with tests, two small component edits. Verify by
re-running the CDP sweep: "columns whose tooltip reaches the header" should be
0 for clipping purposes, with every tooltip fully inside the card.
