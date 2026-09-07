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

---

## 2026-09-07 — Feedback round: live dial updates, mute, bipolar dials, library management, metronome

### Context
First real usage-based feedback after the working prototype and mobile polish passes. Seven notes arrived together, plus a metronome request mid-turn. All were concrete and actionable, not requests for discussion, so implemented the full list in one pass rather than triaging into "do now" vs "ask first."

### Decision(s)

**Live parameter updates on a looping pad.** The request was "pitch speed and filter needs to happen on the fly... as it's looping." Previously, dial values were only read at the moment a source node was created — changing a dial while a pad looped did nothing audible until the next trigger. Fixed by:
- `AudioEngine.loopingNodes` now stores `{ source, filter }` per looping pad (previously just the source), so both nodes stay reachable after creation.
- Added `AudioEngine.updateLoopingPadEffect(padId, effectId, value)`, called from `DialPanel`'s `onChange` (alongside the existing `dispatch`) whenever `usePadLooping` says the pad being edited is currently looping. Uses `AudioParam.setTargetAtTime` with a short (15ms) ramp rather than an instant `.value =` set, to avoid a zipper/click artifact on the jump.
- **Deliberately scoped to looping pads only**, not one-shots. A one-shot's dial changes only affect its *next* trigger — updating already-fired one-shot instances doesn't make sense once several are layered (which one would "the" instance even be?). This follows directly from the "retrigger layers freely" decision from the first prototype session; a looping pad has exactly one sustained instance, so there's no ambiguity there.

**Unified "is this pad making sound" tracking**, for "visual display of what's looping, of if a sound is playing." `AudioEngine` gained `activeInstanceCounts: Map<padId, number>`, incremented on every `playBuffer` call (looping or one-shot) and decremented in `onended` — covers both playback styles under one concept. New `usePadPlaying` hook (mirrors the existing `usePadLooping`, same `subscribe`/`useSyncExternalStore` mechanism) drives a `.playing` visual ring on `PadGrid`, replacing the old fixed-140ms `setTimeout` flash hack from the prototype session — the new one reflects real audio duration instead of a guessed constant.

**Mute, independent of loop and of having a sample.** Added `Pad.muted: boolean` and `SET_PAD_MUTED`. Checked at both call sites that trigger playback — `PadButton.handleTrigger` and `useBeatEngine`'s sequencer loop — rather than inside `AudioEngine` itself, consistent with how `triggerStep` already ignores `pad.loop` by caller-side decision rather than engine-side business logic. A muted pad is visually dimmed (grayscale + reduced opacity) so it's obvious why tapping it is silent, and a new mute toggle sits top-left on each pad, mirroring the existing loop toggle's top-right position.

**Dial range redesigned as bipolar (-100..0..100), not 0-100 with 50 as an implicit neutral.** This was flagged directly: "is it playing at 50% speed and why is that the default." The 0-100 scale was actually correct internally (50 always meant "no change") but the *display* read as a literal percentage, which is a real, valid UX complaint independent of the internal math being right. Fixed by recentering the whole range: `NEUTRAL_EFFECT_VALUE` is now `0`, `EFFECT_MIN`/`EFFECT_MAX` are `-100`/`100`, and every dial shows a signed value ("+50", "-25", "0") instead of a bare percentage. `dialToDetuneCents` and `dialToPlaybackRate` were recentered to match (same audible range, -100/+100 now map to what 0/100 used to).
- **Filter redesigned as a bipolar tone control**, not just recentered — a one-directional lowpass sweep has no coherent negative side. Negative values now progressively muffle (lowpass, cutoff dropping), positive values progressively thin the sound (highpass, cutoff rising), 0 is neutral. Modeled as a single `BiquadFilterNode` whose `.type` (a plain settable property — no node recreation) and `.frequency` both change with the dial value, specifically so a value change while looping is a param update, not a graph rewrite. At exactly 0, `type: 'allpass'` is used rather than removing the filter node from the graph — allpass passes all frequencies with negligible audible effect (only phase, not amplitude), chosen so the node topology never changes while a pad loops, only its params. This was a design call beyond the literal note (which only mentioned speed) — applied to all three dials for one consistent bipolar mental model rather than leaving filter as an odd one out.

**Dial snapping to 25-point anchors.** `step={25}` on the range inputs plus a `<datalist>` of anchor values — native HTML range-input snapping does exactly what was asked ("if I slide to 76 it should snap to 75") with no custom rounding logic needed. `<datalist>` tick-mark rendering is a progressive enhancement (inconsistent mobile support); the functional snapping via `step` works everywhere regardless.

**Pad count converted from a slider to a stepper.** Directly per the note ("pad count could be buttons instead of a slider"). A slider is the wrong control for a small, discrete, rarely-touched integer range (1-16) — a −/value/+ stepper in `SettingsPanel` communicates "nudge this integer" far better than a drag gesture. Every remaining slider in the app (BPM, the three dials) is a continuous range where drag-to-fine-tune genuinely earns the control.

**Library: rename, delete, reorder.** `REMOVE_SAMPLE` already existed in the reducer from the prototype session but was never wired to any UI — now has a delete button with an inline confirm (reusing the `.confirm-overwrite` pattern). Added `RENAME_SAMPLE` (inline-editable label, click-to-edit) and `MOVE_SAMPLE` (up/down buttons swapping adjacent positions). Reordering needed a real ordering concept: added `AppState.sampleOrder: string[]` alongside the existing `samples: Record<string, Sample>` — samples stay keyed by id for O(1) lookup (pads still reference by id), `sampleOrder` is purely display/edit order, kept in sync on `ADD_SAMPLE` (push) and `REMOVE_SAMPLE` (filter out). Drag-and-drop reordering was considered and rejected for this pass — up/down buttons are simpler, fully keyboard/screen-reader accessible, and don't need a pointer-drag library dependency; can still grow into drag-and-drop later without a data model change, since `sampleOrder` doesn't care how it gets reordered.

**Visualizers**, per "recording and library need... visualisers." Two purpose-built pieces, not one overloaded component:
- `LiveWaveform`: canvas-based, runs its own `requestAnimationFrame` loop reading directly from the recorder's `AnalyserNode` — deliberately bypasses React state for the per-frame data (pushing 60fps samples through `setState` would be wasteful and janky); only the `active` boolean is React-visible. Replaces the old segmented RMS-level meter from the mobile-polish session.
- `StaticWaveform`: a lightweight SVG bar-chart from precomputed peaks, used both in the library list (per-sample thumbnail) and the assign prompt (preview of what you just recorded). Peaks (`Sample.peaks: number[]`) are computed once at record time via a new pure `computePeaks(buffer, bucketCount)` utility (max-abs downsampling into buckets) — not recomputed per render, since a several-second recording is hundreds of thousands of samples.
- The post-recording assign prompt now also has an inline rename field pre-filled with the default name, addressing "recording and adding to a library need to be a bit more intuitive" directly — naming happens in the same moment as assigning, right where you're already looking at the waveform you just captured, instead of being a separate trip back to the library later.

**Metronome** (added mid-turn). `Transport.metronomeEnabled: boolean` + `SET_METRONOME_ENABLED`. `AudioEngine.playMetronomeClick(time, accent)` synthesizes a short sine-wave blip with a fast attack/decay gain envelope — no sample or bundled asset needed for something this simple. `useBeatEngine`'s `onStep` callback fires a click on every 4th step (quarter notes in the 16-step/16th-note grid), accented (higher pitch, louder) on step 0, gated behind `metronomeEnabled`. Toggle lives in `PlayBar` next to the loop-mode toggle, since it's a control people flip on/off *during* playback, same reachability argument as everything else already living in the sticky bar.

### A second bug a deferred test caught
The previous session's journal entry flagged `contrastingTextColor` as untested pure logic, explicitly deferred. This session touched dial mapping heavily enough to count as "the next engine-adjacent change," so wrote the test — and it failed immediately. The function's threshold (`luminance > 0.55`) was arbitrary/eyeballed rather than derived from the actual WCAG relative-luminance formula it computes. The mathematically correct crossover (where white-vs-black contrast ratios against a background become equal) is `sqrt(1.05 × 0.05) − 0.05 ≈ 0.179`, not 0.55. Checked luminance for all 8 pad-palette colors directly: every one of them falls *below* 0.179, meaning under the corrected threshold every pad should get dark text — and under the old, wrong threshold, yellow, green, and teal were all rendering white text at contrast ratios that fail WCAG AA even for large/bold text (as low as 1.92:1 on yellow, against a 3:1 minimum). Fixed the threshold to the derived value; visually confirmed via a fresh browser screenshot that pad-color-coded circles across the whole palette now render legible dark text. Recorded here for the same reason as the `Scheduler` `Illegal invocation` bug from the prototype session: a real, live bug that shipped and was found by finally doing the thing a prior entry said was deferred, not by getting it right the first time.

### Alternatives considered
- Updating one-shot instances live too, not just looping ones — rejected; there's no single "the instance" once retriggers have layered several overlapping copies, and the request was specifically about the looping/sustained case.
- Checking `pad.muted` inside `AudioEngine` itself — rejected in favor of call-site checks, keeping the engine's contract as "play what I'm told to play," consistent with how loop-vs-one-shot triggering is already split by caller, not by the engine inspecting pad state.
- True bypass (removing the filter node from the graph) at neutral, instead of an `allpass` no-op — rejected; would require reconnecting nodes when crossing through 0 while looping, risking an audible glitch on exactly the transition this whole feature is supposed to make seamless.
- Drag-and-drop library reordering — rejected for this pass in favor of up/down buttons; see Decisions above.
- Recomputing waveform peaks on every render instead of once at record time — rejected on cost grounds for anything beyond a trivially short recording.

### Reasoning
Most of this list is direct implementation of explicit, unambiguous asks. The two places genuine judgment calls were made — filter-as-bipolar-tone-control (redesign, not just recenter) and mute-checked-at-call-sites (architecture consistency) — both extend patterns already established in earlier sessions rather than introducing new ones, which is the point of having those patterns on record.

### Outcome
Full verification pass: `tsc -b`, `vite build`, `oxlint` (same two expected warnings), `vitest run` (33/33, up from 30 — added `waveform.test.ts` and the previously-deferred `color.test.ts`), `prettier --check`, all clean. Comprehensive mobile-viewport browser check (iPhone 13 emulation, real `tap()`, fake mic device) exercising every new feature end-to-end in one run: live waveform during recording, static waveform in the assign prompt, rename reflected in the library, pad-count stepper (buttons, not slider), a pad set to loop showing both `.looping` and `.playing` classes simultaneously, the dial panel's "live" tag appearing while looping, a dial drag producing the correct signed label and taking effect immediately, loop stopping cleanly on second tap, mute visually applied and confirmed to actually prevent playback on tap, metronome toggling on, library reorder moving the correct item, library delete reducing the count — zero console errors throughout. `project.md` updated to match (dial semantics, mute, metronome, `sampleOrder`/`peaks` in the data model sketch, resolved open questions).

### Open questions / carried forward
- Library search remains open (not yet needed at current library sizes); reorder/rename/delete are done.
- The two `react/only-export-components` oxlint warnings remain expected/accepted, unchanged from prior entries.
- Datalist tick-mark rendering for the dial anchors is inconsistent across mobile browsers (progressive enhancement only) — the functional snapping itself is not affected.

---

## 2026-09-07 — Trim, info tips, discard, and a loop-interaction redesign

### Context
Four follow-up notes, three of them landing mid-turn while implementing the first: (1) per-file audio trim/crop, surfaced from the dial panel; (2) a tap/hover info icon explaining each dial; (3) an explicit way to discard a recording so it doesn't clutter the library; (4) partway through implementing trim, separate feedback that the loop interaction "doesn't make too much sense" — pad tap should always just play the pad, the loop button should directly start/stop looping in one tap each, and a pad should show what it's actually doing right now rather than a stored mode.

### Decision(s)

**Trim is non-destructive and per-pad, not per-sample.** The original `project.md` had explicitly deferred this ("no trimming/editing UI planned... can add later if needed") — this is that later. Two implementation choices made without being asked, both because Web Audio makes them nearly free:
- `AudioBufferSourceNode` already supports playing a sub-region natively — `.start(when, offset, duration)` for one-shots, `loopStart`/`loopEnd` for loops — so trim never touches the underlying `AudioBuffer`. Added `Pad.trimStart`/`trimEnd` (fractions 0-1, not seconds, so they stay meaningful regardless of which sample is currently assigned) and a pure `trimToPlaybackWindow(trimStart, trimEnd, durationSeconds)` helper (`src/engine/trim.ts`) converting fractions to the seconds these APIs want — tested without any AudioContext, same pattern as `dialMapping.ts`.
- Made it **per-pad rather than per-sample** — the note said "manipulate the audio in each file," which reads as per-sample, but per-pad is strictly more capable (a sample can be trimmed differently on different pads) and enables genuine sample-chopping (one long recording split across several pads by trim window alone) — a real, idiomatic sampler workflow, not scope creep for its own sake. Trim resets to (0, 1) whenever a pad's assigned sample changes, since a trim window meaningful on one waveform has no correct meaning on a different recording.
- Live-updatable while looping, following the exact pattern `updateLoopingPadEffect` established last session: `loopStart`/`loopEnd` are plain settable properties on an already-playing `AudioBufferSourceNode` (unlike `offset`/`duration`, fixed at `.start()` time), so `updateLoopingPadTrim` just sets them directly — takes effect on the source's next pass through the loop, no restart, no glitch.
- UI is a purpose-built `WaveformTrimEditor`: the existing `StaticWaveform` with two drag handles overlaid, using window-level `pointermove`/`pointerup` (not per-handle pointer capture) so a drag keeps tracking even if the finger slips off the small handle target — chosen deliberately for a touch-first app where handles are necessarily small.

**Info tips: tap-to-toggle, not hover-only.** Hover doesn't exist on this app's primary target (a phone), so a `title`-only tooltip would be functionally absent for the actual audience. Built `InfoTip` as a small "i" button that toggles a bubble on tap (with outside-tap-to-dismiss via a `pointerdown` listener) and carries `title` too, so desktop hover works as a bonus rather than the only path. Applied to all three dials plus the new Trim control, per the note's literal scope ("each dial") extended to trim since it's dial-adjacent and equally non-obvious.

**Discard: deferred commit, not add-then-remove.** The straightforward fix would have been adding a "Discard" button that calls `REMOVE_SAMPLE` right after the existing immediate `ADD_SAMPLE`. Rejected in favor of the architecturally cleaner version: recording no longer touches `state.samples` at all until the user actually decides to keep it. `Recorder` now holds the decoded buffer/peaks/label as local, uncommitted state; a new `RecordingReview` component (replacing `PadAssignPrompt` for this specific flow — `PadAssignPrompt` itself is untouched, still used by the library's own "Assign…" action on already-committed samples) only dispatches `ADD_SAMPLE` when the user assigns to a pad or explicitly chooses "keep in library only." Discarding just clears local state — the reducer, and therefore the library, is never touched, not even momentarily.

**Loop interaction redesign — the largest structural change in this entry.** The feedback identified a real design flaw carried since the very first prototype session: `Pad.loop` was a *persisted mode* that changed what tapping the pad body did (tap-to-start-then-tap-to-stop only when that mode was on), which meant the loop toggle button was one step removed from the action it controlled — you set a mode, then had to know to go tap the pad body to actually use it. Fixed by separating the two concerns completely:
- Pad body tap is now **always** a one-shot (`AudioEngine.triggerPad`, simplified — no more toggle-check branch).
- The loop button is now the **only** thing that starts or stops a loop, and it does so directly, in one tap (`AudioEngine.toggleLoop`, extracted from what used to be `triggerPad`'s conditional branch).
- `Pad.loop: boolean` is **removed from the data model entirely**, not just unused — "is this pad looping" was always more correctly engine-side ephemeral state (`AudioEngine.isPadLooping`, already tracked for the visual `.looping` pulse) than persisted app data; keeping a redundant, occasionally-inconsistent `loop` flag around after this change would have been the flimsy-base problem this project has tried to avoid from session one. The loop button's visual on/off state and `aria-checked` now read directly from `usePadLooping` (live engine state) instead of the pad's stored flag — it is now structurally impossible for the button's displayed state to disagree with what's actually playing, which was exactly the source of the original confusion.
- Mute's existing guard pattern extended consistently: starting a new loop on a muted pad is blocked (mirrors blocking a one-shot trigger while muted), but stopping an already-looping pad is always allowed regardless of mute state, since "stop this" should never be blocked by an unrelated silence setting.

### A last pass caught two real lint findings, not just style noise
Running the full check surfaced two `react(purity)`/`react(refs)` warnings that turned out to be genuine, not pedantic:
- `WaveformTrimEditor` was mutating a ref's `.current` directly during render (`latestRef.current = {...}` as a bare statement in the component body) to keep a window-level pointer handler reading fresh props without re-subscribing the effect on every change. Real anti-pattern — moved the assignment into a dependency-less `useEffect` (runs after every render, in the commit phase, which is the actually-safe place to do this), same technique, correct timing.
- `RecordingReview` called `Math.random()` and `Date.now()` from a function defined in the component body (even though only ever invoked from click handlers, never during render) — oxlint's purity check flags this conservatively regardless of actual call site. Rather than suppress it, used it as a prompt to fix a small pre-existing inconsistency: `createId()` already existed in `state/defaults.ts` for pad/pattern ids but samples were generating ids with ad hoc inline `Math.random()` instead — switched to `createId('sample')`, and added a matching `timestampNow()` wrapper for the one remaining `Date.now()` call. Both warnings gone, and sample ids now go through the same helper as everything else instead of a one-off duplicate.

### Alternatives considered
- Trimming the `Sample` (library-level, affecting every pad that references it) instead of per-pad — rejected; strictly less capable (can't chop one recording across pads with different regions) for no offsetting simplicity, since the per-pad version is barely more code once `trimToPlaybackWindow` exists.
- Destructive trim (slicing/copying the `AudioBuffer` to a new, shorter one) — rejected; Web Audio's native `offset`/`duration`/`loopStart`/`loopEnd` playback parameters make non-destructive trim not just safer but actually less code than slicing buffers by hand.
- Add-then-remove for discard (dispatch `ADD_SAMPLE` immediately, `REMOVE_SAMPLE` on discard) — rejected in favor of deferred commit; see Decisions above.
- Keeping `Pad.loop` around as a redundant/legacy field for backward compatibility — never seriously considered; there's no persistence layer to be compatible with (session-only state), so there was nothing to preserve.
- Suppressing the two purity lint warnings with an inline disable comment instead of fixing them — rejected; both were fixable in a few minutes and one surfaced a real (if minor) pre-existing inconsistency worth cleaning up anyway.

### Reasoning
The loop redesign is the one item here that reaches back and corrects a decision from the very first prototype session rather than just adding something new — worth being explicit that this is a correction, not a reversal made lightly: the original tap-to-toggle design was a reasonable reading of the initial spec ("tap to start, tap again to stop") at the time, but real usage showed the two-step mode-then-action indirection was the actual problem, and the fix was available once "is it looping" was recognized as state that already lived correctly in the engine and didn't need a second, persisted copy in the reducer at all.

### Outcome
Full verification: `tsc -b`, `vite build`, `oxlint` (back to only the two long-standing expected warnings), `vitest run` (38/38, up from 33 — `trim.test.ts` plus new reducer coverage for `SET_PAD_TRIM` clamping and the reset-on-reassign behavior). Comprehensive mobile-viewport browser check exercising every piece of this entry end-to-end: discarding a recording leaves the library at 0, keeping one adds it, a waveform preview renders in the review step, a pad body tap never starts a loop, the loop button starts a loop in exactly one tap with its visual state matching, a pad body tap while looping does *not* stop it (confirming the two actions are properly independent), the loop button's second tap does stop it, an info tip opens with the correct text and closes on an outside tap, and dragging the trim handles from the full range to a 25%–75% window correctly halved the reported selected duration (0.42s → 0.21s) with Reset trim restoring it — zero console errors throughout. `project.md` updated: pad playback behavior, sound sampling, dial-panel usage flow, and the `Pad` type sketch (trim fields added, `loop: boolean` removed with a note explaining why it's deliberately absent).

### Open questions / carried forward
- The two `react/only-export-components` oxlint warnings remain expected/accepted, unchanged from prior entries.
- Library search and datalist tick-mark rendering remain open, unchanged from the previous entry.
- Mute doesn't yet silence a pad that's *already* looping when muted mid-loop (it only blocks a new one-shot or a new loop from starting) — a pre-existing gap, not introduced or worsened here, noted for whenever mute gets revisited.

---

## 2026-09-07 — App-shell restructure: from one scrolling page to four dedicated pages

### Context
A prioritized list of UI/IA feedback, plus one more note ("a dedicated button to stop all sounds") mid-turn. Read together, the list amounted to a single coherent ask: stop treating this as one continuously-scrolling page and give the app real information architecture — pads as the home screen, dials/trim and the sequencer each on their own page instead of sharing scroll space with everything else, the library tucked away, and recording/metronome/emergency-stop reachable from anywhere regardless of page. This is the largest structural change of the project so far — bigger than the mobile-retarget pass, since it changes the navigation model itself, not just the layout within one page.

### Decision(s)

**No router library — a plain `NavigationContext`.** Four flat destinations (`pads | sequencer | library | edit-pad`), no need for URLs, browser history, or deep-linking for a session-only casual tool. A context (`src/state/NavigationContext.tsx`) holding `page` + `editingPadId` and exposing `goToPads`/`goToSequencer`/`goToLibrary`/`goToEditPad`/`goBackFromEdit` is the entire navigation layer — same pattern already established for `AppStateContext`/`EngineContext`, kept consistent rather than reaching for a dependency to solve a four-screen problem.

**Three-zone persistent app shell**, all global regardless of page:
- **Top `Nav`**: page tabs (Pads/Sequencer/Library) plus two utility actions — a panic **stop-all-sounds** button and a **settings** gear (opens pad-count/Clear-All as an overlay). Deliberately *not* combined with the bottom PlayBar — Nav is for navigation and emergency control, PlayBar is for shaping how playback sounds (tempo, loop mode, metronome). Different purposes, kept visually and structurally separate rather than cramming a 5th/6th control into an already-tuned PlayBar.
- **Bottom `PlayBar`**: unchanged from earlier sessions, now simply rendered unconditionally around every page instead of once on the single old page — this alone satisfies "metronome available anywhere," since PlayBar was already global chrome, it just didn't have other pages to be "global" *across* before now.
- **Floating `RecordFAB`**: satisfies "record from anywhere" the same way — global chrome, not page content.

**Hold-to-record, not tap-to-toggle.** `RecordFAB` uses `onPointerDown` to start and `onPointerUp`/`onPointerLeave`/`onPointerCancel` to stop — the hold duration *is* the recording, directly, with no separate start/stop state to track or forget. `onPointerLeave` stopping the recording (not just `onPointerUp`) was a deliberate inclusion: a finger sliding off a small floating button mid-press is, in practice, a release, and should behave like one rather than leaving a recording running invisibly. Live feedback (elapsed timer + `LiveWaveform`, reusing the existing recording-visualizer component) appears in a small floating panel while held, positioned above the FAB so it doesn't collide with the bottom PlayBar.

**Recording review became a global modal, not a page-local panel.** Since recording can now start from any page, the existing `RecordingReview` component (built two sessions ago for the deferred-commit/discard flow) needed to be reachable independent of "page" — wrapped in a new `RecordingReviewOverlay` (backdrop + sheet), with `pendingRecording` lifted to `App.tsx`'s top-level `Shell` state rather than living inside a Recorder panel that no longer exists. `RecordingReview` itself needed zero changes — the deferred-commit design from that earlier session (nothing touches `state.samples` until the user actually keeps it) turned out to compose cleanly with "recording is now global," since it was already decoupled from any specific page's layout.

**Pads page: casual stays casual, editing is one explicit tap away.** Considered and rejected a long-press-to-edit gesture on the pad body (common pattern, but conflicts with the pad body's existing tap-to-play and the loop/mute icons' own click handlers — would need careful `pointerdown` bubbling suppression on every icon, and is inherently harder to verify by automated browser testing than an explicit element). Went with a small "selected pad" summary bar below the grid instead: tapping a pad (which already plays it and marks it selected, unchanged behavior) surfaces a bar with the pad's color tag, live looping status, and an explicit "Edit Sound →" button. Keeps the pad itself exactly as casual as before — tap plays, two small icon toggles for loop/mute — while making the deliberate action of editing a single, unambiguous, easily-testable tap rather than a gesture you have to discover.

**"Playing" visibility upgraded from a glow ring to an equalizer-bars overlay.** The existing `.playing` box-shadow ring (from an earlier session) stays, but pads are now the hero content of their own page, so added a small three-bar CSS-animated equalizer icon (`.pad-eq`, pure CSS `@keyframes`, no JS) shown on any pad currently making sound — a more immediately legible "this is making noise right now" signal than a glow alone, directly answering "audio playing from a pad should be readily visible."

**Pad edit page**: `DialPanel.tsx` deleted; its content became `PadEditPage.tsx` — same dials/trim logic, now guaranteed a real pad (no more "tap a pad" fallback branch, since you only reach this page via an explicit pad selection) and given a proper page header (back button, pad identity tag, live playing/looping status) instead of sharing a panel slot with the pad grid.

**Sequencer redesigned, not just relocated.** Three concrete readability changes, all driven directly by the feedback:
1. A step-number header row (1, 5, 9, 13) for orientation while horizontally scrolling.
2. Steps regrouped from one flat row of 16 into four visual `.step-group`s of 4, with alternating subtle background tint — clearer beat-grouping at a glance than the old single border-left-every-4th-step approach, at the same footprint.
3. A small pulsing badge plus a ring around the row's pad-number circle whenever that pad is independently looping (`usePadLooping` per row, via a new `SequencerRow` subcomponent — hooks can't be called inside `.map()`, same reason `PadButton` was already split out of `PadGrid`) — the literal, explicit answer to "the sequencer should not be confused for pad looping... it should be visible there too."

**Stop-all-sounds required extending `AudioEngine`, not just wiring a button.** The existing `stopAll()` only ever stopped *looping* sources (that was all "Clear All" needed before). A real panic button needs to also silence in-flight one-shots — a manual tap, a sequencer hit, a long recording still playing out — none of which were previously tracked anywhere once started (fire-and-forget by design, for layering). Added `activeSources: Set<AudioBufferSourceNode>`, populated in the one shared `playBuffer` path and cleaned up in every `onended` handler (both the plain one and the one `toggleLoop` overwrites), and renamed `stopAll()` → `stopAllSounds()` to actually iterate and stop everything in that set. Reused the same method for both the new dedicated Stop-All button and the existing Clear-All flow (which arguably had the same latent gap before — Clear All resetting the app while a one-shot kept ringing out was never quite right either).

### Alternatives considered
- Long-press-to-edit on the pad body instead of a summary-bar button — rejected; see Decisions above (pointer-event conflicts with existing icon handlers, harder to test).
- Stacking a second fixed bottom bar for page-nav tabs alongside PlayBar (bottom tab bar being the more common mobile convention than a top bar) — rejected; two fixed bottom bars would eat a large fraction of vertical space on a phone, and PlayBar's four controls were already tuned to fit their row. A top bar keeps the zones cleanly separated (navigate at the top, play at the bottom) without doubling up the bottom safe-area math.
- Adding Stop-All as a 5th button in PlayBar — rejected; PlayBar shapes *how* it plays, Stop-All is a different kind of action (emergency, navigation-adjacent), and the top Nav bar had room for it without further crowding PlayBar.
- Making `edit-pad` a fourth Nav tab instead of a contextual push-navigation view — rejected; it's a drill-down detail screen for one specific pad, not a top-level destination you'd navigate to without first having a pad in mind, so a persistent tab for it would be meaningless most of the time (which pad would it show?).

### Reasoning
Nearly everything here follows from one underlying principle stated directly in the feedback: things that need to be reachable "from anywhere" belong in global chrome (Nav/PlayBar/FAB), and things that need their "own dedicated page" belong in page content that doesn't share space with anything else. Once that split was made explicit, most of the individual decisions (where Stop-All goes, why edit-pad isn't a tab, why the FAB is separate from PlayBar) followed from asking which category a given control belonged to, rather than needing a separate judgment call each time.

### Outcome
Full verification: `tsc -b`, `vite build`, `oxlint` (three expected `only-export-components` warnings now — the new `NavigationContext` joins the same accepted pattern as `AppStateContext`/`EngineContext`), `vitest run` (38/38, unchanged — this was a UI/navigation restructure, not a logic change, and the reducer/engine/dial-mapping/trim test suites were correspondingly untouched). Comprehensive mobile-viewport browser check driving the entire new flow in one run: default page is Pads with PlayBar visible, selecting a pad surfaces the summary bar, holding the record FAB shows the live panel and releasing opens the review overlay, assigning closes it and fills the pad, "Edit Sound" opens the edit page with PlayBar still visible around it (global chrome confirmed) and back returns to Pads, looping a pad and switching to the Sequencer tab shows the loop badge on that row, toggling a step works, the Library tab renders the assigned sample, Stop All silences an active loop from any page, the Settings overlay opens and closes, and the metronome toggle in PlayBar still works — zero console errors throughout. `project.md`'s Summary, Layout, and Usage Flow sections rewritten to describe the app-shell/multi-page structure in place of the original single-page description.

### Open questions / carried forward
- The three `react/only-export-components` oxlint warnings (now including `NavigationContext`) remain expected/accepted.
- Library search, datalist tick-mark rendering, and the mid-loop-mute gap remain open, unchanged from prior entries.
- The pad edit page's info tips and trim/dial logic are otherwise unchanged from the prior session — this entry only relocated and re-headered them, so their own open items (none currently) don't need repeating here.

---

## 2026-09-07 — Pad loop button relocated off the pad face

### Context
Direct feedback after using the new app shell: "the pads seem a bit small and the buttons to loop are a bit hard to press... have a better consideration of how the loop button should be / is it the best idea to have it in the pad itself? think thoroughly about the layout from a UX standpoint." Two complaints, one likely-shared root cause: pads at ~80×80px in a 4-column grid, with a ~28px loop/mute icon nested in the corner of each — a small control crowded right up against the pad's own large tap-to-play zone, on the one control (loop) that gets tapped rhythmically during actual play.

### Decision(s)
**No — moved loop and mute off the pad face entirely.** The pad (`PadGrid.tsx`/`PadButton`) is now a single undivided tap target: tap always plays a one-shot, nothing else. It shows only non-interactive visual feedback — the existing glow/pulse/equalizer-bars for playing, a `looping` class for the ring, a plain "muted" text hint — none of which need touch precision, since they're read, not tapped. The interactive controls moved into the existing "selected pad" summary bar below the grid (`PadsPage.tsx`), which already held an "Edit Sound" button — extended into a 3-button action row: **Loop | Mute | Edit →**, each a full `.action-btn` (~103×57px measured, roughly 4x the old icon's touch area). Loop is disabled when the pad has no sample; both loop and mute keep their existing engine/reducer semantics (`engine.toggleLoop`, `SET_PAD_MUTED`) — only *where the button lives* changed, not what it does.

Also widened the grid from 4 columns to 3 (`.pad-grid-cells`), growing each pad from ~80×80px to ~100×100px, and bumped the pad number's font size (1.3rem → 1.6rem) to match. Removed the now-dead `.loop-toggle`/`.mute-toggle` CSS rules.

### Alternatives considered
- **Keep loop/mute on the pad, just make the icons bigger.** Rejected — the underlying problem isn't icon size in isolation, it's two independently-tappable targets sharing one small tile; growing the icons enough to fix mis-taps would eat into the pad's own tap-to-play area, trading one touch-precision problem for another.
- **Long-press the pad body to toggle loop.** Considered and rejected again, consistent with the earlier session's reasoning against long-press-to-edit: conflicts with the pad's existing tap-to-play handler (needs careful timing/threshold tuning to distinguish a tap from a hold), and is inherently harder to verify by automated browser testing than an explicit separate button.
- **A swipe gesture on the pad for loop.** Rejected without much consideration — adds an undiscoverable, undocumented gesture for a core, frequently-used action; the whole point of this round was to make loop *easier* to hit reliably, not to trade a fiddly tap for a fiddlier swipe.

### Reasoning
The general principle from the app-shell restructure applies again here: casual/informational things (is it playing, is it looping, is it muted) don't need touch precision and can stay compact on the pad; deliberate interactive actions (start/stop a loop, toggle mute) do need precision and deserve dedicated space. The selected-pad action bar already existed as exactly that kind of space — extending it to 3 buttons instead of relegating loop/mute to on-pad icons was a natural fit rather than new UI. Shrinking the grid to 3 columns was a smaller, complementary fix to the same underlying "things are too small" complaint — pads are the app's hero content, so giving them more room for a UX price of one extra scroll row is worth it at typical pad counts (8 default).

### Outcome
Full verification: `tsc -b`, `vite build`, `oxlint` (same three expected `only-export-components` warnings, unchanged), `vitest run` (38/38, unchanged — this was UI-only, no reducer/engine logic touched). Comprehensive mobile-viewport (iPhone 13) Playwright check: measured pad size (~100×100px, up from ~80×80px), confirmed zero `.loop-toggle`/`.mute-toggle` elements remain on the pad, confirmed 3 action buttons render at the selected-pad bar with adequate size, loop button correctly disabled on an empty pad and enabled once a sample is assigned, loop toggles on/off via the action bar and survives repeated taps on the pad body (retriggering the one-shot without stopping the loop — the intended "pad body always plays, loop button always controls the loop" separation), mute toggles via the action bar and a muted pad correctly does not play on tap, and the Edit page still opens from the action bar. Zero console errors throughout. `project.md`'s "Pad Playback Behavior" and "Layout" sections updated to describe the action-bar location instead of an on-pad icon.

### Open questions / carried forward
- None new. Everything carried from the prior entry (oxlint warnings, library search, datalist ticks, mid-loop-mute) remains open and unchanged.

---

## 2026-09-07 — Volume/Grit/Echo dials, and unhooking the metronome from Play

### Context
Two requests in one message: "add a volume dial on the edit lets also add a couple ways to really make a unique sound other than speed pitch and whatever," and "metronome should start and stop with the push of the button not with the play button." The second was a real bug, not a preference: the metronome click was fired entirely from inside the sequencer's own lookahead-scheduler callback, which only ran while `Scheduler.start()`/`stop()` had been called by the `isPlaying` effect — so toggling `metronomeEnabled` alone did nothing audible unless the sequencer was already playing, contradicting the metronome's own always-described intent ("available anywhere," "toggled independently of the pads").

### Decision(s)
**Three new per-pad effect dials**, added the same way `filter` was: a new `EffectId`, a pure mapping function in `dialMapping.ts`, a case in `AudioEngine.updateLoopingPadEffect`, and a node permanently wired into `playBuffer`'s graph (never conditionally added) so every dial stays live-updatable while looping without ever needing to rewire the graph mid-loop — the same reasoning Filter already established with its always-present `allpass` at 0.
- **Volume** (`dialToGain`, `GainNode`): -100 = silent, 0 = unity, +100 = a 2x boost that can clip if pushed hard (accepted, not guarded against — a loud pad is sometimes exactly the point).
- **Grit** (`dialToGritParams` + `buildGritCurve`, `WaveShaperNode`): a bipolar *character* dial, not a one-directional "amount" knob — negative quantizes the waveform into progressively fewer steps for a harsh digital lo-fi crunch ("crush"), positive runs it through a `tanh` soft-clip curve for warmer analog-style saturation ("drive"), 0 is the identity curve (clean). Chose two genuinely different textures on one dial specifically because the app already has this "two flavors either side of neutral" pattern from Filter (lowpass/highpass) and it reads consistently once you know the convention.
- **Echo** (`dialToEchoParams`, `DelayNode` + feedback `GainNode` + wet `GainNode`): also two textures on one dial — negative is a short, tight slapback (60-150ms), positive is a longer, spacier delay (150-500ms) with more audible repeats — rather than a reverb. Wet mix and feedback both scale with distance from 0 either direction; 0 is fully dry.
- `EFFECT_IDS` grew to `['pitch', 'speed', 'filter', 'volume', 'grit', 'echo']` — since `createNeutralEffects`, the reducer's `SET_PAD_EFFECT`/`RESET_PAD_EFFECTS`, and `PadEditPage`'s dial list are all already driven generically off this array (no hardcoded effect count anywhere), the new ids just started appearing everywhere for free; only `EFFECT_LABELS`/`EFFECT_DESCRIPTIONS` in `PadEditPage.tsx` needed new entries by hand.

**Metronome decoupled from the sequencer's play state.** The lookahead `Scheduler` in `useBeatEngine.ts` now runs whenever *either* `isPlaying` or `metronomeEnabled` is true, not just `isPlaying` — one shared clock, so the metronome and the sequencer's steps stay phase-locked whenever both happen to be on, rather than running as two independently-drifting clocks. Inside the step callback, the metronome-click branch is now gated only on `metronomeEnabled`, checked *before* an early return on `!isPlaying` that now guards the pattern-triggering/playhead-dispatch logic — so a metronome-only session never fires pad steps and never moves the sequencer's visible playhead (avoiding exactly the "sequencer looks like it's playing when it isn't" confusion the app has been careful about since the nav restructure). A fresh press of Play always force-restarts the clock at step 0 (`scheduler.stop(); scheduler.start()`), even if the metronome was already ticking on its own — this keeps "press Play, pattern starts from the beginning" a reliable guarantee, at the cost of a barely-audible phase jump in the metronome's click at that instant, which reads as the click resyncing to the downbeat rather than as a glitch. A `wasPlayingRef` distinguishes this "just pressed play" transition from every other case (toggling metronome mid-playback, pausing while metronome stays on) that must *not* force a restart, since those would otherwise glitch a pattern already in progress.

### Alternatives considered
- **A convolution-reverb "Space" dial** (algorithmically generated impulse response via `ConvolverNode`, blended with delay-based echo depending on dial sign) — considered, then simplified down to Echo-only. A dual-mode reverb/delay dial would need to switch node *types* depending on which side of 0 the value is on, which breaks the "topology never changes" live-update guarantee every other dial in the app relies on (crossing zero mid-loop would need a graph rebuild, an audible restart). Echo alone stays one persistent `DelayNode` chain across the whole range, so it kept full live-update parity with the rest of the dials — judged worth losing the reverb texture for.
- **A separate, fully independent metronome `Scheduler` instance**, started/stopped purely off `metronomeEnabled` with no relation to the sequencer's clock — considered first as the more obviously "decoupled" design. Rejected: two independently-started lookahead clocks would drift out of phase with each other whenever both happened to be running (each anchors its own `nextStepTime` to whenever *it* was started), so a user dialing in a tempo with the metronome and then hitting Play would likely hear the click and the pattern audibly out of sync — worse than the bug being fixed. Sharing one clock, gated per-purpose inside the callback, avoids this entirely.
- **Reset scheduler on every metronome toggle too**, not just on Play — rejected; would restart/glitch a pattern already mid-playback every time metronome was flicked on or off during a performance, which is a worse regression than the one being fixed.

### Reasoning
For the new dials: the app's existing "always wire the node in, change only params" convention (from Filter) turned out to generalize cleanly to three more effects without needing a new architectural pattern — the only real judgment call was designing Grit and Echo as bipolar *dual-character* dials rather than single-direction "amount" dials, chosen for consistency with Filter's precedent and because a bipolar dial with only one meaningful direction would waste half its range and be confusing next to five dials that all use both sides.

For the metronome: the bug was structural (audio clock lifecycle tied to the wrong piece of state), not a matter of exposing a button — fixing it required understanding that the metronome and the sequencer share the same underlying lookahead-scheduler machinery by construction, and that "independent" doesn't have to mean "a second clock," just "independently gated logic on one clock." That reading also happens to deliver something the user didn't explicitly ask for but that any two clocks would have made worse — the two staying in sync when both are on.

### Outcome
Full verification: `tsc -b` (needed one fix — `WaveShaperNode.curve` is typed `Float32Array<ArrayBuffer>`, stricter than what `new Float32Array(length)` infers, fixed by constructing off an explicit `ArrayBuffer`), `vite build`, `oxlint` (same three expected `only-export-components` warnings, unchanged), `vitest run` (50/50 — 12 new pure-function tests for `dialToGain`/`dialToGritParams`/`buildGritCurve`/`dialToEchoParams`, no existing test needed to change since nothing hardcoded the old 3-effect count). Comprehensive mobile-viewport Playwright pass: confirmed 6 dials render with the right labels (Pitch/Speed/Filter/Volume/Grit/Echo), dragged each new dial and confirmed its displayed value, looped a pad and live-dragged Volume/Grit/Echo while it played with zero thrown errors (exercising the new `updateLoopingPadEffect` branches against a real `AudioContext` graph), then a full metronome-independence pass — toggled the metronome on with Play never pressed and confirmed the play button's state never changes, confirmed the sequencer step never advances while metronome-only, turned it off via its own button, turned it on again and then pressed Play (confirming Play isn't blocked or altered by the metronome already running), paused with the metronome still on and confirmed its button stays lit, and turned it off independently at the end. Zero console errors throughout. `project.md` updated: Dials/Controls section describes all six dials and their live-update behavior including Grit's non-ramped exception, Metronome bullet states its play/pause independence explicitly, the Data Model's illustrative `EffectId` type and two Layout bullets (PlayBar, Pad edit page) updated to match.

### Open questions / carried forward
- None new. Everything carried from prior entries remains open and unchanged.
