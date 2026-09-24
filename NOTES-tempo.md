# Tempo control — tuning notes (local, not shipped)

Goal: a faster way to turn the BPM down (and up) without losing control.
All feel numbers live in `app/src/utils/tempo.ts` → `TEMPO_FEEL`.

## What's there
- **− / +**: tap = 1 BPM. **Hold to run**: repeats after `holdDelayMs`, fine steps speed up,
  then after `coarseAfterMs` it jumps in `coarseStep`s that snap to round numbers (118 → 115 → 110…).
- **Drag the number**: right/up = faster, left/down = slower, `scrubPxPerBpm` px per BPM.
- **Tap the number** → tempo panel: slider (40–240), −10 −5 −1 +1 +5 +10, ½× (half-time), 2×,
  presets (70 80 90 100 110 120 128 140 150 174), Tap tempo (averages the last 4 intervals).
- Tempo changes are live while a beat plays.

## Tuning log
| # | Change | Measured (hold − from 120) | Verdict |
|---|--------|-----------------------------|---------|
| 1 | holdDelay 320, repeat 110 ms ×0.86 → min 40 ms, coarse 5s after 1000 ms | 119 @0.1s · 111 @0.8s · 90 @1.1s · 50 @1.5s · floor 40 @1.8s; 120→85 in 1.25 s | **Too fast** — coarse jumps every 40 ms (~125 BPM/s) overshoot; impossible to stop on a target |
| 2 | coarse phase at a steady 160 ms per 5-BPM jump; fine floor 70 ms | 119 @0.1s · 117 @0.4s · 113 @0.8s · 105 @1.1s · 95 @1.4s · 85 @1.7s · 75 @2.0s; **120→85 in 1.7 s** | Controllable: one readable 5-BPM step every 160 ms (~30 BPM/s); stops exactly on release. Finger hold 1.5 s: 120 → 95 |

## Other fixes during tuning
- Tempo panel ran ~5 px off the right edge of a 390 px phone → now pinned to the screen (10 px margin), width ≤ 340 px.

## Checks (all passing)
- Mouse: hold/release, single tap = 1 step, panel open/close, preset, ½×, 2×, −10/−5, slider, tap tempo (5 taps @ 500 ms → 120), drag down −20 without opening the panel, ½× while playing keeps the beat and playhead going.
- Touch (mobile emulation): finger hold, finger tap opens panel, ½× by finger, finger drag up +20.
- Unit tests: holdStep (fine → snapped coarse), scaleBpm, tapTempo; full suite green.

## Open questions for you
- Is ~30 BPM/s in the coarse phase the right speed, or should it be slower/faster?
- Should the coarse step be 5, or 10 for very big moves?
- Presets list — the right tempos for your styles?

---

# Sequencer: finding pads + filling fast (local, uncommitted)

## What changed
- Rows are named like their pads: number · kit glyph · name (e.g. `03 🪘 Electronic Snare`); long names wrap to 2 lines.
- One shared selection: pick a pad on Pads → its Seq row is highlighted (orange) and scrolled into view; tap a row label → that pad is selected on Pads (and heard).
- Folded banks still show the selected pad's row.
- `⋯` on each row → one-tap fills with a preview: Every beat / Every 8th / Every 16th / Offbeats / Beats 2 & 4 / Clear row; Swap sound + Remove row (drums).
- **Paint** tool (toolbar): drag a finger along a row to fill every step it crosses; start on a lit step to erase. Near the edge it auto-scrolls and keeps painting. A tap still toggles one step.
- Mouse: drag always paints (no tool needed); a plain click still toggles.
- A stroke stays in the row it started in (no spilling onto neighbours).
- **Bar 1 → all** (shown past 16 steps): copies bar 1 onto every bar; asks first if later bars have steps.

## Tuning knobs
- `PAINT_EDGE_PX = 28`, `PAINT_SCROLL_PX = 9` (Sequencer.tsx): how close to the edge auto-scroll kicks in, and its speed per frame.
- `.sequencer-row-fixed` width 126px (index.css): label column width; bigger = more of the name, less grid.
- `ROW_FILLS` (Sequencer.tsx): the fill list.

## Tuning log
- (your notes here)
