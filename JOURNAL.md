# Development Journal

This is a running, append-only log of how this project's blueprint came to be — methodology, implementation decisions, rejected alternatives, and the reasoning behind each. `project.md` is the current state of the plan; this file is *how it got there*. Read top-to-bottom for chronological order.

## How entries work

Each entry is a dated section covering one working session or one coherent chunk of decision-making. An entry should let a future reader answer: *what was on the table, what got picked, and why.* Entries are never edited after the fact to look smarter in hindsight — if a decision later turns out wrong, that gets a **new** entry that says so and explains the correction, rather than a silent rewrite of the old one.

Template for new entries:

```
## YYYY-MM-DD — <short title>

### Context
What prompted this entry — a question, a bug, a feature about to be built.

### Decision(s)
What was actually decided/done.

### Alternatives considered
What else was on the table and why it lost, if relevant.

### Reasoning
Why this call, specifically — tradeoffs, constraints, what would break otherwise.

### Open questions / carried forward
Anything left unresolved that a later entry should pick up.
```

---

## 2026-09-07 — Initial blueprint review

### Context
Starting point was a hand-written `project.md`: a casual, single-page beat maker (record mic snippets → assign to pads → per-pad pitch/speed/filter dials → 16-step sequencer → BPM-driven playback). No backend, no persistence, React + Web Audio + Vite. Asked to review it before doing anything actionable.

### Decision(s)
No code changes yet — this was a critique pass. Findings surfaced (carried into later entries as fixes):

1. **Scheduler timing risk.** The original doc treated `setInterval` and "Web Audio clock" as interchangeable ways to drive the sequencer. They aren't — a naive `setInterval` that fires audio directly drifts and jitters against the main thread. Flagged as the single biggest technical risk to the app feeling good.
2. **Pitch/speed coupling.** As specified (`AudioBufferSourceNode.playbackRate` implied for both), pitch and speed aren't actually independent — `playbackRate` changes both at once via resampling. True independent pitch shift needs DSP the project doesn't want. Flagged with a cheap native fix: `detune` for pitch, `playbackRate` for speed.
3. **Functional gaps in the spec**: no stop/choke mechanism described for looping pads; unclear whether overlapping retriggers of the same pad are intended; record-then-assign vs. assign-then-record UX wasn't the only reasonable choice; shrinking pad count below an occupied pad had no defined behavior.

### Alternatives considered
None yet — this entry is diagnostic, not decision-making. The point was to surface forks before picking a side.

### Reasoning
The project explicitly wants scope to "grow naturally" and the user explicitly dislikes flimsy bases — so the review prioritized *structural* risks (things expensive to fix after code exists) over cosmetic ones.

### Open questions / carried forward
All four findings above, plus: what architecture keeps this from becoming flimsy as it grows? → next entry.

---

## 2026-09-07 — Architecture foundation decisions

### Context
User confirmed the review, then asked for a solid, non-flimsy foundation, said scope should be allowed to grow organically rather than being planned for growth as an explicit goal, and asked to be asked as many questions as needed to set the foundation right. Four architecture forks were identified as the ones expensive to reverse later.

### Decision(s)
1. **Language: TypeScript, strict mode.**
2. **Audio engine: a decoupled module, not React hooks.** `AudioContext`, node graph, and scheduler live in a plain TS class/module outside React. Components call into it and subscribe to its state; they never touch `AudioContext` directly.
3. **State: centralized reducer** (`useReducer` + context) over scattered per-component `useState`. Still "plain React state," just organized as one typed shape updated through actions.
4. **Data model: headroom built in now**, even though today's UI only exposes one pattern and three effects. Effects modeled as an ordered list per pad, not fixed fields; patterns modeled as a collection, not a single hardcoded grid.

All four were offered as a recommended option vs. an explicitly-named flimsier alternative, and the user picked the recommended option on all four.

### Alternatives considered
- Plain JavaScript — rejected; unchecked shapes are exactly the "quiet flimsiness" this project wants to avoid.
- Web Audio logic embedded directly in hooks — rejected; ties audio timing to React's render cycle, harder to unit test without a DOM, harder to extend independently of UI.
- Scattered `useState` per dial/component — rejected; nothing enforces the shape, tends to fragment as features get bolted on.
- Modeling the data exactly to today's feature list (fixed pitch/speed/filter fields, one hardcoded pattern) — rejected; a second pattern or a fourth effect later would mean *restructuring* core state instead of *extending* it.

### Reasoning
The tension in the brief — "grow naturally, not as a goal" *and* "structurally rigid, I dislike flimsy bases" — resolves cleanly if the *architecture* is built for extension but the *feature scope* stays exactly as small as it is today. None of these four decisions add UI work or exposed features now; they only change where the seams are, so later growth is additive instead of a rewrite.

### Open questions / carried forward
The functional gaps from the previous entry (loop stop, retrigger behavior, record flow, pad shrink) still needed answers — they shape the audio engine's actual public API (play/stop/choke semantics), so they're foundation-relevant too, not just UX polish. → next entry.

---

## 2026-09-07 — Functional gap decisions (pad playback semantics, recording flow)

### Context
Follow-up round of questions targeting the engine's play/stop/choke API surface and the recording→pad-assignment flow, since these directly shape method signatures on the audio engine module decided above.

### Decision(s)
1. **Loop stop**: tap toggles — tap starts a looping pad, tap again stops it. One-shot pads always play to completion regardless of taps.
2. **Retrigger behavior**: one-shot pads layer freely — each tap fires a new overlapping playback instance (standard sampler behavior). No choke-on-retrigger logic needed. This also covers the case where a manual tap coincides with a sequencer step firing the same pad — no special-casing required, it's the same behavior.
3. **Recording flow — expanded beyond the original two options.** Rather than picking "assign after recording" or "arm a pad and record into it directly," the user introduced a third shape: recordings always land in a persistent **sample library ("arsenal")** first, independent of any pad. After recording stops you're still prompted to assign the snippet to a pad (keeping the original assign-after-recording UX), but the snippet also stays in the library regardless, so it can be reassigned or reused across multiple pads later. This turned into a real data-model change: pads now hold a `sampleId` **reference** into the library rather than owning an `AudioBuffer` directly.
4. **Pad count shrink**: silent retention. Shrinking pad count is purely a display/trigger-surface change — data for pads above the new count stays in state untouched and reappears if the count grows back. No confirmation dialog, since nothing is actually discarded by this action (explicitly deleting a sample or clearing a pad remains a separate, deliberate action).

### Alternatives considered
- Dedicated stop button per pad, or hold-to-stop — rejected in favor of tap-toggle for simplicity and gesture consistency between desktop click and mobile tap.
- Choke-on-retrigger (new tap cuts the previous instance) — rejected; adds engine-side tracking/cancellation complexity for behavior that isn't actually wanted (layering is normal/expected for a sampler).
- Assign-before-record (MPC-style: tap empty pad to arm and record directly into it) — superseded by the library/arsenal idea rather than explicitly rejected; the library approach keeps assign-after-recording but decouples ownership, which gets the benefit of reuse without giving up the simpler pad-agnostic recording flow.
- Blocking pad-count shrink until the occupied pad is cleared — rejected as more friction than the silent-retention option for no real safety benefit, since nothing is lost either way.

### Reasoning
The library/arsenal reframing is the most structurally significant decision in this entry: it turns `Sample` into a first-class entity or with its own identity and lifecycle, and makes `Pad.sampleId` a reference rather than an owned value. This is exactly what the "data model headroom" decision from the previous entry was meant to make cheap — adding a library layer was possible without restructuring `Pad`, `Pattern`, or the reducer shape, just adding `AppState.samples` as a new top-level collection.

### Open questions / carried forward
- How much library-shelf UI ships in v1 (bare assign-from-list vs. a fuller browsable arsenal with search/rename/delete) — deliberately left open, to grow naturally rather than being decided upfront.
- Cross-browser `MediaRecorder` codec quirks (Safari/iOS) — not a concern unless usage ends up crossing browsers; noted, not resolved.

### Outcome
`project.md` was rewritten to incorporate all decisions from this entry and the previous one: the Architecture Foundations section, the concrete `Sample`/`Pad`/`Pattern`/`Transport`/`AppState` type sketch, the scheduler lookahead note, the detune/playbackRate dial mapping, and the pad-playback/recording-flow behaviors above. Committed as `b147d78` on `claude/beat-maker-project-review-hrbucr`.

---

## 2026-09-07 — This journal

### Context
User asked for a standing journal file in the repo — methodology, implementation notes, comments, thoughts, decisions, everything — so the blueprint's history can be traced by reading a file rather than reconstructing it from conversation.

### Decision(s)
Created `JOURNAL.md` at repo root as a single chronological, append-only log, backfilled with the three prior decision rounds (review findings, architecture foundation, functional gaps) so it starts from an accurate record rather than an empty file. Established the entry template above for future sessions to follow.

### Alternatives considered
- A `docs/journal/` directory with one file per session — rejected for now; a single file is easier to "trace along" linearly as requested, and can be split later if it gets unwieldy.
- Inlining decision rationale as comments in `project.md` itself — rejected; conflates the *current state of the plan* with *how it got there*, which is exactly the distinction this file exists to preserve.

### Reasoning
Kept as one flat file, reverse-engineered from the actual conversation rather than summarized generically, so it reads as a real trail rather than a sanitized changelog.

### Open questions / carried forward
None — going forward, each subsequent working session (implementation or further planning) should append a new dated entry here before or alongside its commit, per the template.

---

## 2026-09-07 — Repo layout: app code lives in `app/`

### Context
User will handle CI/deploy setup themselves (GitHub Actions → Vercel) and specified the working directory for the actual application code.

### Decision(s)
The Vite/React/TS project will live under `app/` as a subdirectory, not at the repo root. `project.md` and `JOURNAL.md` stay at the repo root, alongside `app/`.

### Alternatives considered
Repo-root-as-app-root (Vite project files directly in `/`) — not chosen; user opted for the subdirectory split instead.

### Reasoning
Keeps planning/process docs (`project.md`, `JOURNAL.md`) visually and structurally separate from the app source, which matters more here than usual since this repo is explicitly tracking its own decision history alongside the code.

### Open questions / carried forward
When GitHub Actions / Vercel are wired up (user's side), the build root/working-directory setting on both needs to point at `app/`, not repo root, since `vite build` will run from inside it.

---

## 2026-09-07 — Scaffold: build steps 1–3 (project setup, data model, engine)

### Context
User set up GitHub Actions and was waiting on the app scaffold to connect to Vercel. Time to actually build, covering the first three items of `project.md`'s build-steps list: project setup, data model + reducer, and the audio engine module — the pieces every later feature builds on.

### Decision(s)
- Scaffolded via `npm create vite@latest app -- --template react-ts` into `app/`. The current create-vite (v9) template defaults to **oxlint** instead of ESLint, with no Prettier. Rather than fighting the scaffold back to the originally-planned ESLint setup, kept oxlint (it's a fast, modern, actively-maintained choice and lints the same categories of things) and added **Prettier** on top for formatting, since oxlint doesn't format. This is a deviation from `project.md`'s literal "ESLint + Prettier" line — recorded here rather than silently diverging; not worth updating `project.md` over, since the intent (lint + format tooling in place) is what mattered, not the specific linter package.
- The scaffold's `tsconfig.app.json`/`tsconfig.node.json` did not actually set `"strict": true` despite having several strict-adjacent flags individually enabled — added `strict: true` explicitly to both, plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` for a stricter baseline than the template default, since "strict mode" was a committed decision, not a vague aspiration.
- Implemented `src/state/` (`types.ts`, `constants.ts`, `defaults.ts`, `reducer.ts`, `AppStateContext.tsx`) matching the data model from `project.md`, plus one refinement discovered while implementing the "silent retention" pad-shrink decision: `AppState` needed a separate `visiblePadCount: number` field, distinct from `pads.length`. `pads` now means "every pad slot that has ever existed" (append-only) and `visiblePadCount` controls what's shown/triggerable — shrinking only lowers the latter. Without this split there was no way to represent "hidden but retained" data with a plain array. `project.md`'s data model section was updated to match.
- Implemented `src/engine/`: `dialMapping.ts` (pure functions for the detune/playbackRate/filter-frequency mappings decided in the earlier review), `Scheduler.ts` (the lookahead scheduler — clock and timer both injectable so it's testable with a fake clock and no real `AudioContext`), and `AudioEngine.ts` (the decoupled class owning the lazy `AudioContext`, sample decoding, and the tap-toggle-loop / free-layering-retrigger playback semantics decided earlier).
- Built a minimal `App.tsx` shell (title, BPM slider, pad color swatches) — just enough to prove the reducer/context/engine wiring compiles and renders; not real feature UI. Recording, dials, and the sequencer grid remain future build steps.
- Verified with a full check pass: `tsc -b` (typecheck), `vite build` (production build), `oxlint` (lint — one harmless `react/only-export-components` warning on the context+hook file, a standard and accepted pattern), `vitest run` (19 tests across reducer/dialMapping/Scheduler, all passing), `prettier --check` (clean), and a real browser check (dev server + Playwright screenshot, zero console errors, pads and BPM control render and are interactive) before removing the Playwright dependency again since it was only needed for this one verification pass.

### Alternatives considered
- Fighting the create-vite scaffold to use ESLint instead of the oxlint it shipped with — rejected as churn for no real benefit; oxlint covers the same problem space.
- Representing pad-shrink retention by keeping a separate "archived pads" structure instead of an append-only `pads` array + `visiblePadCount` — rejected; the single-array-plus-count approach is simpler and keeps `Pattern.steps` (keyed by pad id) valid without any pruning/restoration logic.

### Reasoning
This entry is mostly "build exactly what was already decided," which is the point — the architecture and functional-behavior decisions from the earlier entries translated into code without needing to be re-litigated, except for the one genuine gap (`visiblePadCount`) that only became visible once the shrink/grow logic had to actually be written down as a reducer case.

### Outcome
Committed to `claude/beat-maker-project-review-hrbucr` — `app/` scaffold (Vite + React 19 + TypeScript strict), `src/state/*`, `src/engine/*`, and the two doc updates (`project.md` data model, this entry) together. Pushed.

### Open questions / carried forward
- Build steps 4 onward (layout, recording, pad-to-sample wiring, dials UI, sequencer grid UI, BPM/pad-count UI, polish) are still ahead.
- The `react/only-export-components` oxlint warning on `AppStateContext.tsx` is expected and accepted for context+hook files; not something to "fix" later.

---

## 2026-09-07 — Working prototype: build steps 4–10 (full feature loop)

### Context
Vercel was connected and the site was live at `mini-mixer.vercel.app`, still showing only the step-1 wiring shell. User asked for "a good clean working prototype" — time to build the actual feature loop: recording, the library, pad assignment, dials, the sequencer grid, and transport, covering `project.md`'s remaining build steps (4 through 10).

### Decision(s)
- **Engine extended**, not redesigned: added `AudioEngine.playBuffer` (private, shared node-building logic) and split playback into two callers — `triggerPad` (manual tap; tap-toggle for looping pads, free-layering for one-shots, as already decided) and a new `triggerStep(pad, buffer, time)` for the sequencer.
- **Sequencer steps always play as one-shots, regardless of a pad's manual loop-toggle setting.** This wasn't explicitly decided earlier — it surfaced while wiring the scheduler's `onStep` callback to actual playback. A 16-step grid re-triggering an indefinite loop on every active step would be incoherent (each step would toggle the loop on/off rather than hit a beat). Resolution: the loop toggle governs manual "hold a continuous layer" performance use only; programmed steps are always discrete hits, scheduled at the precise lookahead time the Scheduler hands back — this is also what makes sample-accurate step timing possible (`source.start(time)` instead of `source.start()`).
- **Engine-side playback state (which pads are looping) needed a proper subscription mechanism**, not ad hoc polling. `PadGrid` needs to show a looping pad differently, but `AudioEngine.isPadLooping()` reads internal mutable state React has no way to know changed. Added a minimal `subscribe`/`notify` pub-sub to `AudioEngine` and a `usePadLooping` hook built on `useSyncExternalStore` — this is the intended shape of "React subscribes to engine state" from the original architecture decision, not a new pattern bolted on.
- **Pad selection (which pad's dials are shown) is local component state, not reducer state.** It's pure UI/ephemeral, not part of the beat itself, and doesn't need to survive a `CLEAR_ALL` or be modeled for future growth the way samples/pads/patterns do.
- **Library UI kept intentionally minimal** per the standing open question from the architecture round: a flat list with an "Assign…" action per sample, reusing one `PadAssignPrompt` component from both the post-recording flow and the library — no search/rename/delete yet.
- **`useWarnBeforeUnload`**: a plain native `beforeunload` handler. Modern browsers no longer allow a custom warning message (an accepted, unavoidable platform limitation, not a shortfall in the implementation).
- Wired transport (play/pause, loop-mode toggle, BPM, pad count, Clear All-with-confirm) into one `TransportBar`, all writing through the reducer as already designed.

### A real bug the browser check caught that Vitest could not
After wiring everything, a full browser exercise of the golden path (record → assign → trigger → dial → sequence → play), using a headless Chromium with a fake mic device, hit a hard crash on pressing Play: `TypeError: Illegal invocation`, and the whole transport bar vanished from the DOM.

Root cause: `Scheduler`'s constructor stored the bare global `setInterval`/`clearInterval` as instance properties (`this.setIntervalFn = options.setIntervalFn ?? setInterval`). Calling them later as `this.setIntervalFn(...)` invokes them with the `Scheduler` instance as `this` instead of `window`. Real browsers implement `setInterval`/`clearInterval` as branded `Window` methods that reject being called with the wrong receiver — but **Node/jsdom's implementations don't enforce that**, so all 19 Vitest tests (including the ones that call `scheduler.start()`) passed cleanly despite the bug being real and 100% reproducible in an actual browser.

Fixed by binding both to `globalThis` at construction (`setInterval.bind(globalThis)`). Left a comment on the fix explaining why, specifically so a future "let's just trust the test suite" instinct doesn't reintroduce something like this.

This is the concrete reason the workflow's "test UI changes in an actual browser, not just the test suite" rule exists — it's recorded here as a real example, not a hypothetical one. No unit test could have caught this class of bug in this environment; jsdom's `setInterval` doesn't have the receiver check to trip.

### Alternatives considered
- Making `AudioEngine.triggerStep` respect `pad.loop` the same way `triggerPad` does — rejected once it became clear this would make a looping pad's sequencer row behave as a toggle rather than a rhythm, which isn't what a step grid means.
- Polling `engine.isPadLooping()` on an interval or on every dispatch, instead of a subscribe/notify mechanism — rejected as exactly the kind of ad hoc coupling the decoupled-engine decision was meant to avoid.
- Putting `selectedPadId` in the reducer as `AppState` headroom (consistent with the "leave room to grow" data-model decision) — rejected specifically because it's not beat data; the headroom decision was about the domain model (samples/pads/patterns/effects), not UI-only state.

### Reasoning
Almost everything here followed directly from decisions already on record — the one place this entry adds genuinely new information is the sequencer/loop interaction (a gap the earlier functional-gap round didn't anticipate because it wasn't visible until the scheduler and the pad's manual playback path had to share the same `AudioEngine`) and the `Illegal invocation` bug, which is a lesson about test-environment fidelity worth keeping on record rather than letting it look like it always worked.

### Outcome
Full feature loop verified end-to-end in a real headless-Chromium browser (fake mic device, `--use-fake-ui-for-media-stream`): record → decode → library entry → assign to pad → pad shows filled/colored → manual trigger plays → dial drag updates and audibly affects playback → sequencer steps toggle and light up in the pad's color → Play starts the scheduler, the playhead (`.step.current`) advances and highlights the same column across all rows simultaneously as designed → pad count control reflows the grid → all with zero console errors after the Scheduler fix. `tsc -b`, `vite build`, `oxlint`, `vitest run` (19/19), and `prettier --check` all clean. Playwright was reinstalled only for this verification pass and removed again afterward, consistent with the earlier session.

### Open questions / carried forward
- Deferred UI polish: a fuller library (search/rename/delete), a live waveform during recording (currently a simple RMS level meter, not a waveform — a reasonable, smaller stand-in), and general visual refinement are all still open, per the standing "grow naturally, not as a goal" instruction.
- The two `react/only-export-components` oxlint warnings (`AppStateContext.tsx`, `EngineContext.tsx`) remain expected/accepted.

---

## 2026-09-07 — UX/UI polish pass, retargeted to mobile

### Context
Asked to "keep going, give it a good polish in terms of UX and UI." Mid-pass, a second message landed: **"this is supposed to be a phone app btw consider the design."** That arrived after the polish work had already started (a contrast-aware pad-text utility was in progress) but before any layout decisions were locked in, so it reset the direction of the whole pass rather than being a follow-on note — the desktop two-column layout from the prototype session was never the right target to begin with.

### Decision(s)
- **Layout rebuilt mobile-first, single column.** The `.row` grid pairing (Recorder+Library side by side, PadGrid+DialPanel side by side) from the prototype session is gone. Everything stacks vertically: header → Recorder → Library → PadGrid → DialPanel → Sequencer → Settings. This isn't a responsive breakpoint bolted onto a desktop design — it's designed for a phone viewport as the primary target, per the "single page, everything visible" spec, on a screen where "visible" means "reachable by scrolling," not "on screen at once."
- **Transport split into two pieces by touch frequency.** `TransportBar` (built in the prior session) is gone, replaced by:
  - `PlayBar` — fixed to the bottom of the viewport (`position: fixed`, safe-area-inset-aware padding for notched phones): play/pause, BPM, loop-mode toggle. These are the controls a hand rests on while performing; they now stay reachable regardless of scroll position, which is the standard pattern in phone music apps (GarageBand, Caustic, etc.) and wasn't something the desktop layout needed.
  - `SettingsPanel` — pad count and Clear All, which are occasional actions and stayed in the normal document flow.
- **Touch targets resized against real minimums, not eyeballed.** Pads went from a desktop-appropriate size to 74×74px (checked in-browser, comfortably above the ~44px touch-target guideline). The sequencer's 16-step grid is the one deliberate compromise — at 34×34px it's below the ideal minimum, but 16 columns at 44px+ each doesn't fit a phone width at all; the tradeoff taken is a horizontally-scrollable row (with a sticky, color-coded pad-index label so you always know which row you're on while scrolled) plus an explicit "Swipe sideways for all 16 steps" hint, rather than shrinking pads/other controls to force-fit all 16 steps on screen.
- **Custom range slider styling.** Native `<input type="range">` thumbs are too small to drag reliably with a finger and don't carry any of the app's identity. Restyled via `::-webkit-slider-thumb`/`::-moz-range-thumb` to a 26px colored thumb, with dial sliders taking their color from the pad they're editing (`--dial-color` custom property) so a glance at the dial panel tells you whose sound you're shaping.
- **Contrast-aware pad text** (`src/utils/color.ts`, `contrastingTextColor`): pad number/tags now compute white-vs-near-black text via relative luminance instead of hardcoded white, since the pad palette includes yellow, where white text was becoming close to unreadable. Small pure function, unit-tested-worthy but not yet covered by a test — noted below.
- **First pad auto-selected for the dial panel**, with a `useEffect` in `App.tsx` that falls back to the first visible pad whenever the currently-selected one is hidden by shrinking pad count. Removes the "select a pad" dead-end that existed in the prototype (dials were unreachable without knowing to tap a pad first) and keeps selection valid across pad-count changes without adding selection to the reducer (still local UI state, per the earlier session's reasoning).
- **Recorder polish**: added an elapsed mm:ss timer (`useElapsedSeconds`) and swapped the single-bar level meter for a 12-segment LED-style meter — both closer to what "live waveform/level display" in the original spec was gesturing at, without building an actual waveform renderer (still an open/deferred item).
- **Library rows now show which pad(s) a sample is assigned to** (or "unassigned"), as colored tag pills — makes the "arsenal" concept from the second journal entry actually visible in the UI for the first time, not just present in the data model.
- **Viewport meta tightened for an app-like feel**: `maximum-scale=1.0` (pinch-zoom disabled) plus `viewport-fit=cover`, `theme-color`, and `apple-mobile-web-app-*` meta tags. Disabling pinch-zoom is a real accessibility tradeoff, taken deliberately here because the app is full of drag-based controls (sliders, pads) where accidental pinch-zoom during a gesture is actively disruptive — a common, accepted tradeoff for instrument-like touch apps, but worth naming rather than leaving implicit.
- **Favicon replaced** with a simple 2×2 rounded-square pad-grid glyph in the accent color, in place of the generic Vite template mark.

### A rendering artifact investigated and ruled out
During the mobile-viewport browser check, one screenshot showed what looked like a stray purple rounded-square outline around the sequencer's row-label circles. Investigated properly rather than dismissed or silently patched around:
1. Pulled computed styles (`outline`, `boxShadow`, `border`, `filter`) on the element directly — all `none`, ruling out a real CSS rule.
2. Bisected the exact interaction sequence that produced it, screenshotting after each step — the artifact did not reproduce at any step.
3. Re-ran the original script that had produced it, unmodified — came back clean.

Conclusion: a one-off headless-Chromium screenshot/compositing glitch (likely a rasterization seam tied to a `position: sticky` element at a specific sub-pixel scroll offset during that one capture), not a reproducible bug in the app. Recorded here rather than left unmentioned, since "investigated and ruled out" is a different claim than "didn't look."

### Alternatives considered
- Keeping the two-column desktop layout and only adding a mobile breakpoint — rejected once "this is a phone app" landed; a breakpoint retrofit tends to leave the primary-target layout as an afterthought, whereas building mobile-first meant the desktop experience (which still works fine at wider widths via the same single column, just with more whitespace) was never treated as the design center to begin with.
- Making all 16 sequencer steps shrink to fit one phone-width screen with no scrolling — rejected; touch accuracy would suffer badly at that size, and horizontal-scroll-per-row is an established, well-understood pattern on mobile sequencers.
- Leaving pinch-zoom enabled — considered, but the drag-heavy control surface (dials, pads, BPM slider) makes accidental zoom during a gesture a worse experience than losing zoom entirely; noted as a tradeoff rather than a silent default.

### Reasoning
The mid-task pivot didn't require throwing away work — the contrast utility, flash-on-trigger feedback, and button/tag styling groundwork already in progress were all still correct regardless of layout — but it did mean the layout and transport-control decisions needed to be made for the actual target device before going further, rather than polishing a desktop arrangement that would need redoing anyway.

### Outcome
Verified in a real Playwright-driven Chromium session emulating an iPhone 13 viewport, using `tap()` (not `click()`) throughout: full golden path (record → assign → trigger → dial → sequence → play) works via touch, pad/play-button touch targets measured in-browser at 74×74 and 56×56px, the play bar stays pinned to the viewport bottom after scrolling to the end of the page, zero console errors. Along the way, fixed a real accessibility bug the check surfaced: the loop-mode button had no `aria-label` and its accessible name was falling back to a long `title` string that happened to contain the word "play," colliding with the Play button's own accessible name. `tsc -b`, `vite build`, `oxlint`, `vitest run` (19/19), and `prettier --check` all clean. Playwright reinstalled for this session's verification only, removed again afterward.

### Open questions / carried forward
- `contrastingTextColor` (`src/utils/color.ts`) is a pure function with no dedicated unit test yet, despite the project's stated testing philosophy of covering pure logic — worth adding alongside the next engine-adjacent change rather than as a drive-by here.
- A real waveform (vs. the current segmented level meter) and a fuller library UI (search/rename/delete) remain open, per the standing "grow naturally" instruction.
- The two `react/only-export-components` oxlint warnings remain expected/accepted, unchanged from prior entries.
