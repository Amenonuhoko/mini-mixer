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

---

## 2026-09-07 — Metronome relocated, default pad count, heading centering, dial ordering

### Context
A short punch list: move the metronome next to the record button; make default pads 9; center the "Pad 1" heading; and (mid-turn, via a screenshot of the edit page) reorder the six dials by how often they'd actually get used. Two more items came bundled in the same message but weren't concrete build requests: "the play bar... can be something different for the pads tab" (phrased as "I think," an opinion floated for discussion) and "start thinking about how we can save our libraries or songs" (explicitly "start thinking about," not "build"). Both are addressed in this session's reply as a recommendation/question rather than code — see below.

### Decision(s)
- **Metronome moved out of PlayBar, into a new floating cluster beside the record FAB.** New `MetronomeButton.tsx` (48px circle, same on/off styling PlayBar's version had) rendered alongside `RecordFAB` inside a new `.fab-cluster` wrapper in `App.tsx`, replacing the old single always-fixed `.record-fab`. Reasoning: the metronome is a page-agnostic utility independent of sequencer transport (this was the whole point of last round's fix decoupling it from `isPlaying`) — grouping it with Record, the app's other "reachable from anywhere, not transport-gated" control, reads more honestly than leaving it in a bar whose other three controls (play/pause, BPM, loop-mode) are all specifically about sequencer playback.
- **Default pad count: 8 → 9** (`DEFAULT_PAD_COUNT`). With the 3-column grid from the previous round, 9 is a clean 3×3 with no partial row — 8 left a lonely two-pad third row.
- **Edit page header restructured to a 3-column grid** (`grid-template-columns: 1fr auto 1fr`): back button in column 1 (left), the "Pad N" tag in column 2 (centered, new `.edit-pad-heading` class), live playing/looping status tags in column 3 (right, wrapped in a new `.edit-pad-header-tags` div). Centering only the middle column — not the whole row — means the heading stays visually centered whether or not a status tag happens to be present, instead of drifting left/right depending on the right column's content width.
- **Dials reordered by expected usage frequency**: `EFFECT_IDS` changed from `[pitch, speed, filter, volume, grit, echo]` to `[volume, speed, pitch, filter, grit, echo]`. Volume first (touched on nearly every pad to balance a mix), then Speed/Pitch (the classic sample-flipping moves), then Filter (a common but more occasional tone tweak), Grit/Echo last (character effects reached for least often). Since `createNeutralEffects`, the reducer, and `PadEditPage`'s render loop are all already driven generically off this array's order, this was a one-line change with no other code affected.

### A bug found and fixed along the way
Widening the floating corner cluster from one circle (record) to two (metronome + record) turned a marginal pre-existing overlap into a real one: on the Pads page, the selected-pad action bar's **Edit** button ended up completely unclickable — Playwright's own tap failed with "`<div class="fab-cluster">` intercepts pointer events." Root cause: `.app-shell`'s bottom padding only ever reserved space for the play bar, not for the FAB(s) floating above it, so on a sufficiently tall page (which 9 pads' full 3×3 grid made more likely than 8's partial grid) the last on-page content could end up directly underneath the fixed FAB cluster. Fixed by adding a `--fab-height` var and including it in `.app-shell`'s bottom padding, plus `pointer-events: none` on `.fab-cluster` itself (`auto` restored on its direct children) so the gap between the two buttons never blocks taps either. Re-verified the Edit button opens reliably after the fix.

Separately (not fixed, and not new): on the Edit page specifically, the fixed FAB cluster visually overlaps whatever dial happens to be scrolled to that screen position (observed sitting over part of the Speed slider mid-scroll) — this is inherent to any fixed floating overlay atop a scrollable page (the same way a Gmail-style compose FAB overlaps list content while scrolling) and already existed in narrower form with the record FAB alone; it wasn't introduced by this change, just slightly widened by it. Not treated as a bug worth chasing in this round.

### Alternatives considered
- **Stacking the metronome above the record FAB instead of beside it** — rejected; the user said "next to," which reads as horizontal adjacency, and vertical stacking is already the pattern used for the live-recording panel that appears *above* the FAB while holding it, so stacking metronome there too would visually compete with that existing element.
- **Shrinking or auto-hiding the FAB cluster on scroll** to avoid the Edit-page dial overlap — considered, then set aside as out of scope for a punch-list item that only asked to reposition the metronome; flagged in this entry instead so it's not silently lost.

### Reasoning
Each of the four concrete items had a fairly direct, low-risk fix once located in code — the interesting part was noticing that the metronome relocation had a compounding effect with the pad-count change (taller default grid) that surfaced a real, previously-marginal layout bug. Fixing that properly (accounting for FAB height in the shell's reserved padding, not just the play bar) is the kind of thing that would have kept resurfacing as more pads/content got added later, so it was worth fixing at the source rather than patching around this one instance.

### Outcome
Full verification: `tsc -b`, `vite build`, `oxlint` (same three expected warnings), `vitest run` (50/50, no logic changed by this round — everything here was UI/layout/ordering). Playwright pass on a real mobile viewport: confirmed 9 pads render in a 3×3 grid, the metronome button sits beside (not inside) the record FAB and toggles independently of the play button, the play bar no longer contains a metronome control, the "Pad N" heading measures dead-center in its header row both with and without a status tag present, and — after the FAB-overlap fix — the Edit button reliably opens the pad edit page. Zero console errors. `project.md` updated: pad count default, dial list and their new order, the metronome's new home next to record, the PlayBar's narrowed scope, and the edit header's 3-column layout.

### Open questions / carried forward
- **Saving libraries/songs**: explicitly "start thinking about," not a build request yet. This is a real architecture pivot — `project.md`'s Saving section currently states "None needed. Session-only, resets on reload" as a deliberate foundational decision — so it gets the same upfront-discussion treatment other foundational forks in this project got, rather than a guessed implementation. A recommendation was given in this session's reply; not yet decided or built.
- The FAB-over-dial-content overlap on the Edit page (noted above) remains, low priority, unaddressed.
- Everything else carried from prior entries (oxlint warnings, library search, datalist ticks, mid-loop-mute) remains open and unchanged.

---

## 2026-09-07 — PlayBar moved to Sequencer-only

### Context
Follow-up to the item left open above: whether the Pads tab's bottom bar could be "something different." Asked the user directly rather than guessing, since play/pause + BPM + loop-mode are genuinely sequencer-specific and the alternatives had real trade-offs. They picked hiding it entirely on Pads (recommended option): those controls move to a real transport bar that exists only on the Sequencer page, with background playback continuing if you navigate away.

### Decision(s)
`Shell` in `App.tsx` now reads the current page from `useNavigation()` and computes `showPlayBar = page === 'sequencer'`, conditionally rendering `<PlayBar />` only there. Rather than just hiding the component and leaving reserved layout space behind, the whole shell got wrapped in a single div carrying `style={{ '--playbar-height': showPlayBar ? '76px' : '0px' }}` — since `--playbar-height` already drove both `.app-shell`'s bottom padding and the FAB cluster's vertical offset (from the previous round's fix), collapsing it to 0 when the bar is hidden automatically closes the gap in both places with no separate CSS rules needed. `.record-live-panel`'s position, defined off the same variable, follows along correctly too.

### Alternatives considered
Covered in the previous entry's "Open questions" — keep BPM only, or leave the bar unchanged everywhere. Superseded by the user's explicit choice.

### Reasoning
This was a case where the existing `--playbar-height` CSS-variable architecture (built for a different reason — accounting for the play bar in the FAB's floating position) turned out to generalize directly to "the play bar doesn't exist on this page at all," with no new variables or duplicated rules needed. Wrapping the whole shell in one div to scope the override was the only structural change required, since `Nav`/`PlayBar`/the FAB cluster were previously siblings inside a fragment with no shared ancestor to hang a CSS custom property on.

### Outcome
Full verification: `tsc -b`, `vite build`, `oxlint` (same three expected warnings), `vitest run` (50/50, no logic touched). Playwright pass: confirmed no `.play-bar` renders on the Pads tab, confirmed play/pause + BPM + loop-mode all render and work on the Sequencer tab, confirmed the record FAB sits measurably lower (closer to the true viewport bottom) on Pads than on Sequencer — proving the reserved space actually closes rather than leaving a gap — and confirmed pressing Play on Sequencer, navigating to Pads, and navigating back shows playback continued the whole time with no play bar ever appearing on Pads. Zero console errors. `project.md`'s PlayBar and Sequencer-page bullets updated to describe it as page-scoped rather than global chrome.

### Open questions / carried forward
- **Saving libraries/songs** remains open, per the previous entry — a recommendation was given in this session's reply, not yet decided or built.
- The FAB-over-dial-content overlap on the Edit page (from the previous entry) remains, low priority, unaddressed.
- Everything else carried from prior entries (oxlint warnings, library search, datalist ticks, mid-loop-mute) remains open and unchanged.

---

## 2026-09-07 — Saving: export/import file, then autosave added

### Context
Picking up the open question from the previous entry. Presented the fork directly: autosave (IndexedDB) vs. explicit export/import file vs. both. The user picked export/import file only first, then — a couple messages later, after that was built and verified — said "yeah I guess add autosave too." So this entry covers both, built in that order.

### Decision(s)
**Shared serialization core** (`src/engine/projectFile.ts`), used by both the file format and autosave: `encodeWav(buffer)` writes 16-bit PCM WAV bytes from a decoded sample; `AudioContext.decodeAudioData` reads WAV natively, so loading a sample back in reuses `engine.decodeSample` — the exact path recording already uses — with no new decode code. `encodeWav` takes a small structural `PcmSource` interface (`numberOfChannels`/`sampleRate`/`length`/`getChannelData`) rather than the DOM `AudioBuffer` type, specifically so it's unit-testable with a plain mock object — jsdom (this project's Vitest environment) doesn't implement Web Audio at all, so a real `AudioBuffer` isn't constructable in tests. `extractProjectMeta`/`buildTransport` factor out the "AppState's non-audio fields" shape shared by both storage mediums (transient fields like `isPlaying`/`currentStep` are deliberately dropped — a loaded project always starts paused at step 0, never mid-playback).

**File export/import**: `serializeProject`/`deserializeProject`/`isSerializedProject` build one self-contained JSON object (`version: 1`, every sample's audio inline as base64 WAV, plus pads/patterns/transport) — one file, no ZIP library, no separate asset-file management. UI lives in `SettingsPanel.tsx`: "Save" downloads `beat-maker-<timestamp>.json` via a Blob + temporary `<a download>`; "Load" opens a hidden file input, parses and validates the JSON (`isSerializedProject`), then shows a confirm step before actually replacing state (mirrors the existing Clear-All confirm pattern) since loading destructively overwrites the current session.

**Autosave** (`src/state/autosave.ts` + `src/hooks/useAutosave.ts`): a thin IndexedDB wrapper (`saveAutosave`/`loadAutosave`/`clearAutosave`) storing the same `ProjectMeta` shape but with audio as raw `ArrayBuffer`s rather than base64 — IndexedDB stores binary natively, so there's no reason to pay the ~33% base64 overhead on every debounced write the way the one-off downloadable file does. `useAutosave` does two things: loads any existing snapshot once on mount (dispatching `LOAD_PROJECT` if found), then writes back on every state change after that, debounced 1.2s so dragging a dial doesn't hammer the database on every tick. A `hydratedRef` guards the write side from firing before the initial load attempt resolves — otherwise the blank starting state could race ahead and overwrite an existing autosave record before it's had a chance to be restored.

**Removed `useWarnBeforeUnload`** (and its now-empty hook file) — its entire reason for existing was "you'll lose your session-only work" on reload/close, which autosave now directly resolves; keeping a "you might lose work" warning around when work genuinely isn't lost anymore would just be a misleading nag.

**Clear All now also clears the autosave record** (`clearAutosave()`, fired alongside the existing `dispatch({type: 'CLEAR_ALL'})`) — otherwise clearing would feel broken, since the next reload would silently restore the very state you just cleared.

### Alternatives considered
- **A ZIP bundle (manifest + separate audio files)** for the export format — rejected in favor of one flat JSON file with inline base64 audio; no library needed (this project has zero non-React runtime dependencies and that was worth preserving), and a single file is simpler for a casual user to save/attach/share than a multi-file bundle.
- **Storing raw Float32Array channel data in IndexedDB** instead of WAV-encoding for autosave, to avoid both the encode step and 16-bit quantization loss — considered, then set aside in favor of reusing the exact same `encodeWav`/`decodeSample` round trip as the file-export path, so there's one shared "AppState ⇄ portable representation" core instead of two divergent encodings to maintain. 16-bit WAV's quantization is inaudible for this app's use case (casual recordings, not mastering-grade audio).
- **A full JSON-schema validator** for imported files (e.g. zod) — rejected as overkill for a casual project; `isSerializedProject`'s shallow structural check (right top-level keys/types) is enough to reject garbage input without adding a dependency, and a per-sample `decodeAudioData` failure inside `deserializeProject` still throws (caught at the call site) if the audio itself turns out malformed despite passing the shape check.

### Reasoning
The interesting design decision was recognizing that "autosave" and "export/import" are really the same transformation (`AppState` ⇄ a portable, JSON-safe representation) with two different storage backends bolted on — factoring `projectFile.ts` as the shared core meant autosave, once requested, was mostly wiring (an IndexedDB read/write wrapper and a debounce hook) rather than a second parallel implementation of sample serialization. Keeping transient playback state out of both formats was a small but deliberate choice: a "project" is the data you built, not a snapshot of the transport mid-scrub, so loading one should always land you at a clean, paused starting point.

### Outcome
Full verification: `tsc -b`, `vite build`, `oxlint` (same three expected warnings), `vitest run` (56/56 — 12 new tests for `encodeWav`'s WAV header/round-trip fidelity, base64 round-tripping across a chunk boundary, and `isSerializedProject`'s validation). Comprehensive mobile-viewport Playwright pass covering the full lifecycle: recorded a sample into a pad, waited past the autosave debounce, reloaded the page, and confirmed the pad and library both came back; opened Settings and used Save, then inspected the actual downloaded file's JSON (`version: 1`, one sample with non-empty `audioBase64`, 9 pads); used Clear All, reloaded, and confirmed the cleared state persisted (autosave didn't resurrect the old session); loaded the earlier-downloaded file back in through the Load flow (confirm prompt appears, pad is restored after confirming); and fed a malformed JSON file through the same input, confirming it surfaces an inline error instead of crashing. Zero console errors throughout. `project.md`'s Saving section rewritten from "None needed" to describe both mechanisms, plus updates to the Infrastructure Notes, Layout's settings-gear bullet, and Usage Flow's Step 10 (removed the now-inaccurate "browser warns before reload" line, added that Clear All also clears the autosave record).

### Open questions / carried forward
- The FAB-over-dial-content overlap on the Edit page (from two entries back) remains, low priority, unaddressed.
- Autosave re-encodes every sample's audio to WAV on every debounced write, even when only a dial or step changed and no sample data changed at all — fine at this app's expected scale (a handful of short recordings), but would be worth caching per-sample WAV bytes (only re-encode a sample when it actually changes) if libraries grow large enough for this to become a noticeable cost. Not built now — premature for a casual project's current usage patterns.
- Everything else carried from prior entries (oxlint warnings, library search, datalist ticks, mid-loop-mute) remains open and unchanged.

---

## 2026-09-07 — Loop mode, gate/hold playback, pad-switcher strip, edge-swipe back, effect presets

### Context
A large, multi-part request arriving in several consecutive messages: replace the per-pad Loop button with a global loop-mode toggle that makes tapping any pad toggle its loop; a sampler/instruments system; a bottom volume mixer; a "Pad → beat → sequence → pad" iterative workflow; then, mid-turn, several more asks — a back-swipe gesture with a confirm step, hiding "menus at the bottom," a scrollable pad-switcher on the Edit page with loop built in, Filter/Grit/Echo presets, and a gate-vs-full-duration playback idea the user explicitly asked me to design rather than pick from options. Given the size, this was split into phases; this entry covers the first phase (pad interaction + navigation). A second, still-open request from the same wave — instruments, a real volume mixer, and bounce-to-pad — is deliberately deferred, tracked in Open Questions below, since it depends on this phase's foundations (loop mode, the effect-graph shape) landing first.

Two rounds of clarifying questions preceded this work (see the conversation, not reproduced here) — resolved: loops layer freely but quantize to the beat when joining others already playing; the loop-mode toggle lives in the thumb-reachable FAB cluster, not the top nav; instruments will draw from both bundled presets and pitch-mapped recordings; the mixer will be a genuinely separate value from the existing per-pad Volume dial, on its own page. This entry's work doesn't touch the mixer/instruments themselves yet.

### Decision(s)
**Loop mode**: a new `padLoopModeEnabled` boolean on `Transport` (same home as `metronomeEnabled` — a page-agnostic mode switch, not sequencer-playback state), toggled by a new `LoopModeButton.tsx` living in the FAB cluster alongside Record and Metronome. `PadGrid.tsx`'s `PadButton` now branches on this flag: off, pointerdown triggers a one-shot (see gating below); on, pointerup toggles the pad's loop via `engine.toggleLoop`. The per-pad Loop button is gone from `PadsPage.tsx`'s action bar (Mute + Edit remain) — one global toggle replaces a button that would otherwise need to exist on every pad.

**Loop sync**: `AudioEngine` now tracks `bpm` (kept in sync from `useBeatEngine`, mirroring how the `Scheduler` already gets it) and a `loopEpoch` — the audio-clock time the *first* loop in the current group of layered loops started. `toggleLoop` starts a fresh loop immediately (and resets the epoch) if no other pad is currently looping; otherwise it computes the next bar boundary from the epoch (`Math.ceil` of elapsed-bars-since-epoch × bar length) and schedules `source.start()` there instead of "now." `isPadLooping` goes true the moment the loop is scheduled, not when it becomes audible — accepted as a minor UI/audio lag (up to one bar, ~6s at the slowest allowed 40 BPM) in exchange for not needing a new "queued" visual state.

**Gate vs. full-duration playback** — the "come up with something neat" challenge: no new setting, toggle, or pad-face zone at all. `PadButton`'s pointer handlers (rewritten from a plain `onClick` to `pointerdown`/`pointerup`/`pointercancel`, with `setPointerCapture` so a finger drifting off the small tile still reports back to it, not a neighboring pad) start playback on pointerdown exactly as before and arm a `setTimeout` at a `GATE_HOLD_THRESHOLD_MS` (200ms) threshold. If release comes before the timer fires, nothing else happens — the sound plays out in full, identical to today's tap behavior. If the hold outlasts the threshold, the pad is "gated," and release calls `.stop()` on the specific source instance (now returned by `AudioEngine.triggerPad`, previously `void`) immediately. This reuses the same hold-gesture language `RecordFAB` already established elsewhere in the app, needs no settings UI, and doesn't touch the pad's single tap target.

**Pad-switcher strip + per-pad Loop button on the Edit page** (`PadSwitcherStrip`/`PadSwitcherSwatch` in `PadEditPage.tsx`): a horizontally-scrollable row of small swatches (color + number, current one outlined, a small pulsing dot if that pad is looping) lets you jump between pads via `goToEditPad` without leaving the editor. Deliberately no tap-to-toggle-loop on the swatches themselves — same touch-precision reasoning as ever (a second small interactive zone nested in an already-small tile) — instead one full-width "Loop this pad" button sits just below the strip, always acting on whichever pad is currently selected there.

**Edge-swipe back, with a confirm defaulting to "stay"**: initially implemented as pointer handlers on the edit page's own content div, which turned out to be a real bug, not just a test artifact — `.app-shell` has 16px of padding, so the page's content div starts 16px in from the true viewport edge, and a swipe starting at the actual screen edge (the whole point of an edge-swipe gesture) landed outside it entirely, never reaching the handler. Fixed with a dedicated `.swipe-edge-zone` — a 24px-wide, full-height, `position: fixed` strip flush with the true left edge, using `setPointerCapture` on its own pointerdown so a drag reported there keeps reporting there even once the finger moves far outside that narrow strip. Crossing 80px of rightward travel shows an inline "Leave this pad?" confirm (reusing the existing `.confirm-overwrite` pattern) with **Stay** as the primary button and **Leave** as secondary — the explicit "← Back" button in the header stays instant and unconfirmed, since a deliberate tap on a labeled control doesn't need the same protection an easy-to-trigger-by-accident gesture does.

**"Hide menus at bottom"** — interpreted as: hide the *loop-mode* toggle specifically on the Edit page, since that page now has its own pad-specific loop button and showing the global toggle right next to it would be confusing (which one does a tap there even mean?). Record and Metronome stay visible on every page including Edit, unchanged — hiding those would have contradicted the app's own established "reachable from anywhere" principle for recording, so a narrower reading of this instruction was chosen over one that would have silently regressed something already decided.

**Filter/Grit/Echo presets**: a small `EFFECT_PRESETS` table in `constants.ts` (Telephone, Underwater, Vinyl, Cavern — each a named combo of filter/grit/echo values, all on the same 25-point anchors the dials already snap to) and a row of preset buttons above the dial list on the Edit page. Applying one dispatches `SET_PAD_EFFECT` for exactly those three dials (and live-updates a currently-looping pad exactly like dragging one by hand would) — Pitch/Speed/Volume are untouched.

### Alternatives considered
- **Splitting the pad tile into top/bottom zones** for gate vs. full-duration — the option offered but not chosen; rejected for the same touch-precision reasoning that's recurred throughout this project's pad-layout decisions, in favor of the gesture-based (no new UI) approach above.
- **A per-pad "gate" setting on the Edit page** — my own first pitch, superseded once the "make it neater" challenge led to realizing gating didn't need to be a mode at all, just a natural consequence of hold duration.
- **A pointer-capture-tracked touch-toggle directly on each pad-switcher swatch** — considered for "add the loop ability in that menu too," rejected in favor of one full-sized button below the strip, avoiding a second small interactive zone per swatch.

### Reasoning
Several of these (gate/hold, the swipe-zone fix, hiding only the loop-mode FAB) came down to the same underlying question asked repeatedly throughout this project: does a new control need its own dedicated space, or can it be expressed as a natural extension of a gesture/mode that already exists? Gate/hold and the edge-swipe both landed on "reuse an existing gesture language rather than add a new visible control," while loop mode itself is the one place a new persistent, visible toggle was actually warranted, since "what does tapping a pad do right now" needed a clear, always-visible answer.

### Outcome
Full verification: `tsc -b`, `vite build`, `oxlint` (same three expected warnings), `vitest run` (56/56, unchanged — everything this round was UI/gesture/engine-scheduling, no new pure-logic units suited to unit tests beyond what already exists). Comprehensive mobile-viewport Playwright pass: confirmed the FAB cluster's loop-mode toggle is visible everywhere except the Edit page (Record/Metronome stay visible there); confirmed the per-pad Loop button is gone from the Pads action bar (2 buttons, not 3); toggled loop mode and confirmed tapping two different pads loops both simultaneously (layering) and stopping both works; confirmed a quick tap keeps playing shortly after release while a hold-past-threshold-then-release stops promptly; confirmed the pad-switcher strip renders the right pad count, its loop button toggles the selected pad and shows the pulsing dot, and switching pads via the strip updates the page; confirmed all four presets exist and one (Underwater) sets exactly filter/grit/echo, leaving pitch untouched; and, after finding and fixing the edge-zone bug via a focused debug script, confirmed the swipe gesture reliably shows the confirm banner and both Stay/Leave paths work correctly. Zero console errors throughout. `project.md` updated: Pad Playback Behavior rewritten for loop mode + gating + sync, the Layout section's FAB cluster/Pads-page/Edit-page bullets updated, and Usage Flow's Step 4 updated to match.

### Open questions / carried forward
- **Still queued from this same request wave**: a real volume mixer (its own page, a value genuinely separate from the existing per-pad Volume dial), an instruments/sampler system in the Library (bundled presets + pitch-mapped recordings, assignable across the grid as a mini-keyboard), and bounce-to-pad from the Sequencer (render the current pattern to a new pad, completing the "pad → beat → sequence → pad" cycle). Not started — the user was told these come next, in that order, after this phase.
- The FAB-over-dial-content overlap on the Edit page (from three entries back) remains, low priority, unaddressed.
- Autosave's per-write full re-encode (from the previous entry) remains, low priority, unaddressed.
- Everything else carried from prior entries (oxlint warnings, library search, datalist ticks, mid-loop-mute) remains open and unchanged.

---

## 2026-09-07 — Effects bypass button

### Context
"Add a button for turn off effects below mute" — a quick per-pad way to silence all effect dials without leaving the Pads page.

### Decision(s)
Added a reversible **bypass**, not a reset: a new `effectsBypassed: boolean` on `Pad`, toggled by a new "Effects" button directly below Mute in the Pads-page action bar. `AudioEngine`'s three trigger paths (`triggerPad`/`toggleLoop`/`triggerStep`) now read through a small `effectiveEffects(pad)` helper — an empty array when bypassed, the real `pad.effects` otherwise — reusing the existing `effectValue()` lookup's `?? 0` fallback to get "every dial reads as neutral" for free, no separate neutral-effects construction needed. A new `updateLoopingPadEffectsBypass` loops `updateLoopingPadEffect` once per `EFFECT_ID` so toggling bypass on a currently-looping pad is audible immediately, same as dragging any other dial.

**Layout**: "below mute" was literal — `.selected-pad-actions` changed from a 3-across flex row to a CSS grid (`1fr 1fr` × 2 rows): Mute top-left, the new Effects button bottom-left directly beneath it, Edit spanning both rows on the right so it stays one large target instead of shrinking to a third of the row.

### Alternatives considered
- **Wire the button to the existing `RESET_PAD_EFFECTS` action** (the Edit page's "Reset dials") — rejected: that's destructive (zeroes the stored values), while "turn off" reads as a toggle you'd want to reverse. A bypass you can flip back on, restoring exactly what was dialed in, is more useful and matches the phrasing.

### Reasoning
The empty-array trick for bypass (rather than building a `createNeutralEffects()`-equivalent to pass in) works because `effectValue`'s lookup already treats "not found" as neutral — the same reason `effectiveEffects` needed no new logic in `AudioEngine`, just a different array handed to code that already existed.

### Outcome
Full verification: `tsc -b`, `vite build`, `oxlint` (same three expected warnings), `vitest run` (56/56, unchanged). Mobile Playwright pass: confirmed the Effects button renders directly below Mute (same x, lower y) with Edit spanning both rows; set a dial to +75, bypassed, confirmed the dial's stored value is still +75 on the Edit page despite the pad playing neutral; un-bypassed and confirmed the "fx off" tag disappears; toggled bypass on a currently-looping pad with no crash and the loop still running. Zero console errors. `project.md` updated: a new Pad Playback Behavior bullet for the bypass, and the Layout section's Pads-page bullet describing the new three-action grid.

### Open questions / carried forward
- Everything from the previous entry (mixer, instruments, bounce-to-pad, FAB overlap, autosave re-encode, and all earlier carried items) remains open and unchanged.

---

## 2026-09-07 — Instruments (synth presets + pitch-mapped recordings)

### Context
The largest piece of the earlier feature wave, prioritized first at the user's explicit request ("that seems the longest task"). Two decisions from an earlier clarifying round shaped this: instruments draw from both bundled presets and pitch-mapped recordings ("Both"), and picking one "takes over the whole grid as a mini-keyboard" (assigns notes to pads in order, replacing what's there).

### Decision(s)
**Every instrument key is a real library `Sample`, not a new playback concept.** An `Instrument` (`id`, `name`, `source: 'preset' | 'recording'`, `keySampleIds: string[]`) is just a named group of 16 sample ids — `INSTRUMENT_KEY_COUNT = MAX_PAD_COUNT` (16), so "use in pads" never runs short regardless of the current pad count. This was the load-bearing design choice: since keys are ordinary samples, "apply an instrument to the grid" is exactly `ASSIGN_SAMPLE_TO_PAD` repeated across the visible pads, and every key immediately gets full trim/effects/loop/mute for free — no new playback path needed anywhere in `AudioEngine`.

**New engine module `engine/synth.ts`**, fully decoupled from `AudioEngine`/React — offline rendering needs neither a live `AudioContext` nor any app state:
- `renderSynthNote(frequencyHz, patch)`: one oscillator (+ optional octave-up overtone oscillator, used for Piano's richer tone) through a gain envelope (attack/decay/sustain/release) and an optional lowpass, rendered via `OfflineAudioContext` into a standalone `AudioBuffer`.
- `renderPitchShiftedCopy(source, semitones)`: bakes a pitch shift permanently into a new buffer via an offline `detune`d playback — the exact same mechanism the live pitch dial already uses, just rendered once. Semitones are always `>= 0` here (keys only ascend from the root), which matters: a pitched-up source plays faster/shorter, never longer, so `source.length` samples of offline context is always enough — no truncation risk, which wouldn't hold for a downward shift.
- `INSTRUMENT_PRESETS`: Piano (triangle + sine overtone), Bass (sine, lowpassed), Lead (sawtooth, lowpassed) — deliberately simple patches, not attempting to sound like real instruments, just distinct enough starting points without any audio assets.
- `buildInstrumentKeysFromPreset`/`buildInstrumentKeysFromRecording` run all 16 renders via `Promise.all` (each is independent) rather than sequentially, keeping the "Building…" wait short.

**Reducer**: `ADD_INSTRUMENT` (registers the instrument and its key samples into the library in one action), `APPLY_INSTRUMENT_TO_PADS` (maps `keySampleIds[i]` onto `pads[i]` for every visible pad, resetting trim same as any reassignment), `REMOVE_INSTRUMENT` (deletes the instrument *and* its generated key samples from the library, unassigning any pad using one — otherwise deleting an instrument would leave 16 orphaned, meaninglessly-named samples behind).

**UI**: new `InstrumentLibrary.tsx`, rendered above the existing sample list on the Library page. Lists existing instruments (name, source tag, Use in Pads / Delete, both confirmed since they're destructive — Use in Pads overwrites the whole grid, Delete removes samples). "New from preset" is three one-tap buttons. "New from a recording" opens a small picker listing library samples — **deliberately excluding samples that are themselves already-generated instrument keys**, a bug caught by the browser verification pass below (picking a Bass key as the "root" for a new instrument produced an instrument named "Bass 1" instead of using the actual new recording), fixed by filtering `state.instruments`' combined `keySampleIds` out of the picker's list.

### Alternatives considered
- **A dedicated recording flow specifically for instrument roots** (its own hold-to-record UI inside the Instruments section) — rejected in favor of picking from existing library samples. The app already has one robust, global recording mechanism (`RecordFAB`); reusing it means no duplicated recording UI, and lets you decide "turn this into an instrument" after the fact rather than having to commit to that intent at record time.
- **A real-time synth engine** (a Web Audio voice you could play polyphonically, tune live) instead of pre-rendering 16 fixed keys — rejected as substantially more engineering for a casual project, and it would've meant instruments couldn't reuse the pad/sample/effects pipeline at all. Baking 16 keys once, up front, means everything downstream (trim, effects, loop, mute, save/load, autosave) already works on them with zero new code.
- **A no-rename policy for instruments** (unlike samples, which support rename) — accepted as a scope cut; an instrument's name comes from its preset or its root recording's label, fixed at creation. Not a hard technical constraint, just left out of this round.

### Reasoning
The "every key is a real Sample" decision is the one that made this tractable as "the longest task" without it becoming disproportionately larger — it meant zero new engine playback code, zero new pad-assignment UI (reused `ASSIGN_SAMPLE_TO_PAD`'s semantics via a bulk variant), and automatic interop with everything built in every prior round (save/load, autosave, effects, trim, loop, gate/hold). The only genuinely new engineering was the offline audio rendering itself, which turned out to be self-contained and testable independent of the rest of the app's architecture.

### Outcome
Full verification: `tsc -b`, `vite build`, `oxlint` (same three expected warnings), `vitest run` (60/60 — 4 new reducer tests for `ADD_INSTRUMENT`/`APPLY_INSTRUMENT_TO_PADS`/`REMOVE_INSTRUMENT`, plus one closing a gap from last round for `SET_PAD_EFFECTS_BYPASSED` that hadn't gotten a reducer test yet). Comprehensive mobile-viewport Playwright pass: built the Bass preset (confirmed 16 new key samples appear in the library within ~2s), applied it to all 9 pads and played one with no errors, recorded a new sample and built a second instrument from it, confirmed both instruments list correctly with the right source tags, deleted the Bass instrument and confirmed exactly its 16 key samples vanished from the library (not the other instrument's), and along the way caught and fixed the root-picker bug described above. Zero console errors throughout. `project.md` updated: a new Instruments subsection under Core Features, the Library-page Layout bullet, and the illustrative `Instrument`/`Pad.effectsBypassed`/`Transport.padLoopModeEnabled`/`AppState.instruments` additions to the Data Model (the latter two were missing from a prior round's doc update — caught and fixed here too).

### Open questions / carried forward
- The volume mixer and bounce-to-pad, from the same original request wave, remain queued — next up per the user's stated priority order.
- The FAB-over-dial-content overlap on the Edit page, autosave's per-write full re-encode, and everything else carried from prior entries remain open and unchanged.

---

## 2026-09-07 — Instrument Mode, popups for Edit/Library, performance recording

### Context
Follow-up request: move "apply an instrument to the grid" out of the Library page and make it a pad-grid setting instead (asking which instrument first), show which instrument occupies which pads, let recording while in that mode capture a performance instead of the mic, add a quick popup to pull a library sample onto a pad, turn the pad editor into a popup instead of a page, and confirm there's a way to save the current project as a local file.

### Decision(s)
**Instrument Mode is a third global pad-grid mode**, alongside the existing loop mode — a new `Transport.padInstrumentModeEnabled`, toggled by a new FAB next to `LoopModeButton`. The two are mutually exclusive, enforced centrally in the reducer (`SET_PAD_LOOP_MODE_ENABLED`/`SET_PAD_INSTRUMENT_MODE_ENABLED` each clear the other), not left to the UI to coordinate. Turning instrument mode on always opens a "choose an instrument" popup first — there's no implicit "whatever was applied last." Picking one dispatches the existing `APPLY_INSTRUMENT_TO_PADS` (confirmed first if any pad already has a sound) and flips the mode on in the same gesture. This replaces the old per-instrument "Use in Pads" button on the Library page entirely — building an instrument and applying it are now two separate steps in two separate places, matching "instrument mode is a setting of the pads."

**Instrument badges are unconditional, not mode-gated.** `PadGrid` builds a `sampleId → icon` map once per render from every instrument's `keySampleIds` (`utils/instrumentIcon.ts` maps preset names to an emoji, recordings to a generic one) and shows a small badge on any pad holding one of those keys — regardless of whether instrument mode is currently on. Toggling the mode off doesn't hide the badges; it only removes the grid's dashed-outline "mode active" treatment. This reads better than gating the badges on the mode: the badge answers "what's on this pad," which stays true either way.

**Performance recording reuses the existing recording-review pipeline wholesale**, branching only at capture time. `AudioEngine` gained `startPerformanceCapture`/`stopPerformanceCapture`/`logPerformanceHit`/`performanceElapsedSeconds`, tracking hits with `performance.now()` (wall-clock, not the audio context's clock — capture can start the instant the FAB is pressed without waiting on context resume). `RecordFAB` checks `padInstrumentModeEnabled` on press: if on, it calls `engine.startPerformanceCapture()` instead of starting the mic recorder; each `PadButton` press, when a capture is active, logs `{padId, buffer, effects, trim, offsetSeconds, durationSeconds}` — `durationSeconds` is `null` for a quick tap (play the full trimmed window) or the measured hold time for a gate, mirroring the gate logic that already existed for live playback. On release, `engine.stopPerformanceCapture()` returns the hit list, which a new `engine/bounce.ts` renders offline (`OfflineAudioContext`, rebuilding the same effect-chain wiring `AudioEngine.playBuffer` uses live, the same "decoupled offline module" pattern `engine/synth.ts` established) into one `AudioBuffer` — handed to the exact same `onRecorded` callback a mic recording uses, so the review popup (name it, assign to a pad, or keep in the library only) needed zero changes.

**Two more popups, both the established `overlay-backdrop`/`overlay-sheet` pattern**: `PadLibraryPicker` (opened from a new fourth "Library" action on the Pads page, alongside Mute/Effects/Edit in a plain 2×2 grid) lists every library sample for one-tap assignment to the selected pad, confirming only if it'd replace an existing sound — the reverse direction of the Library page's own "Assign…" flow. And the pad editor itself: `PadEditPage` no longer renders as a fourth "page" in `NavigationContext` — `editingPadId` now opens and closes a `PadEditOverlay` independent of `page`, so editing a pad no longer navigates away from wherever you were. This let the whole edge-swipe-to-go-back gesture and its "Leave this pad?" confirmation be deleted outright: every dial/trim change already dispatches immediately, so a popup has nothing "unsaved" to protect — dismissing via backdrop tap or a close (✕) button is now instant, same as every other overlay in the app.

**Save-as-a-local-file was already built** (`SettingsPanel`'s Save/Load, backed by `serializeProject`/`deserializeProject` — a self-contained JSON download with samples embedded as base64 WAV, and a file-picker Load with a confirm step) from an earlier round; this request needed no new code, just confirming it still works after everything else in this round.

### Alternatives considered
- **Keep instrument application on the Library page, just add a mode flag** — rejected: the request was specifically to move the *action* itself to be pad-grid-driven, not just track a flag while the trigger stays on another page. Centering it on a FAB (like loop mode) keeps "what mode is the grid in" answerable from one glance at the FAB cluster, without a trip to Library.
- **Gate the instrument badge on `padInstrumentModeEnabled`** — rejected in favor of always showing it: hiding it while the mode is off would make it look like the pad's identity changed, when only the *interaction mode* changed. The badge is a fact about the pad ("this is a piano key"), not a mode indicator.
- **Route captured hits through `AudioEngine.triggerPad`'s return value and an `onended` listener**, computing duration from real audio-clock timing — considered and rejected in favor of logging from `PadButton`'s own gate-timer state (which already exists for live gating): the pad button already knows definitively whether a press was a tap or a gate and for how long, so re-deriving that from source lifecycle events would have been duplicate, more fragile logic for the same answer.
- **Keep the pad editor as a fourth page with its edge-swipe-back gesture** — rejected once it became a popup: the gesture and its confirmation existed specifically to protect against accidentally leaving a full-page destination, a problem a dismissible overlay with nothing unsaved doesn't have. Carrying it forward would have been complexity with no remaining purpose.

### Reasoning
Making Instrument Mode and Loop Mode mutually exclusive in the reducer (rather than the two FAB components privately coordinating) means any future third pad-grid mode only has to update its own two lines of exclusivity logic against the existing ones, and it's exercised directly by a reducer unit test rather than only reachable through UI interaction. Reusing the recording-review pipeline for performance captures — rather than building a parallel "performance saved" flow — is the same principle Instruments applied to sample playback: a captured performance becomes an ordinary `AudioBuffer` + peaks as early as possible, so everything downstream (naming, pad assignment, library storage) is code that already existed and was already tested.

### Outcome
Full verification: `tsc -b`, `vite build`, `oxlint` (same three pre-existing warnings), `vitest run` (61/61 — one new reducer test for the loop/instrument mode mutual exclusivity). Comprehensive mobile-viewport Playwright pass (21 checks, all passing): built a Piano instrument, turned on Instrument Mode via its FAB, confirmed the picker popup and the resulting per-pad badges; confirmed turning on Loop Mode turns Instrument Mode off (and vice versa); held the record FAB while tapping two instrument pads (simulated as two independent synthetic pointers, since a real hold-record-while-tapping-pads gesture is two simultaneous touches) and confirmed the "Performance N" review popup appeared, then kept it in the library; opened the Pads-page Library popup and used it to replace a pad's sound, confirming the replace-confirmation and popup-close behavior; opened the Edit popup and confirmed it renders inside `overlay-backdrop`/`overlay-sheet` rather than as a page, that a dial change commits immediately, and that both a backdrop tap and the close button dismiss it; confirmed the loop-mode FAB is hidden while the edit popup is open and reappears after closing it. Zero console errors throughout. `project.md` updated: Instruments and Pad Playback Behavior rewritten for the two-mode split and performance capture, the Layout section's FAB-cluster/Pads-page/Pad-edit-popup/Library-page bullets rewritten, and `Transport.padInstrumentModeEnabled` added to the Data Model.

### Open questions / carried forward
- The pad-grid action bar now visually overlaps the FAB cluster's bottom-right corner more than before (a third FAB widened the cluster) — functionally still tappable (confirmed via Playwright, which would otherwise fail on an intercepted click), but worth a proper layout pass together with the pre-existing FAB-over-dial-content overlap on the Edit page, rather than patching each spot separately.
- The volume mixer and bounce-to-pad-from-the-sequencer remain queued.
- Autosave's per-write full sample re-encode and everything else carried from prior entries remain open and unchanged.

---

## 2026-09-07 — Pads-page layout pass: FAB overlap root-caused, action bar re-weighted

### Context
"Let's do a full layout pass through, let's look at the pads page — take a screenshot and ask questions on where we can improve (it's everywhere)." Sent screenshots of the Pads page in several states (empty, a filled pad selected, muted); the FAB overlap flagged as a carried-forward issue in the last entry was visibly worse than "cosmetic" — the Library button was almost entirely hidden behind the piano/metronome/mic icons. Four targeted questions went back before touching anything: how to fix the FAB overlap, what empty pads should look like, what the instrument badge should show, and how to resolve the color-emphasis mismatch between Mute/Effects (plain) and Edit/Library (accent-colored) given Mute/Effects are the more-used pair. Answers: consolidate the FABs, "your call" on empty pads, show the key number on the badge, and flip the emphasis so Mute/Effects are the prominent ones.

### Decision(s)
**Consolidated Loop Mode + Instrument Mode into one `GridModeButton`.** Deleted `LoopModeButton.tsx` and `InstrumentModeButton.tsx`; the FAB cluster is back to three buttons (grid-mode, metronome, record) instead of four. The button's icon reflects the current mode (a neutral grid glyph when off, the loop icon, or the piano-keys icon), and tapping it opens an `overlay-sheet` menu — Off / Loop Mode / Instrument Mode — with Instrument Mode flowing straight into the existing "choose an instrument" picker (confirming first if any pad already has a sound, same as before). No reducer changes were needed: `SET_PAD_LOOP_MODE_ENABLED`/`SET_PAD_INSTRUMENT_MODE_ENABLED`'s existing mutual exclusivity is what this UI consolidation sits on top of.

**Root-caused the FAB overlap instead of patching around it again.** Reducing the FAB count from four to three visually shrank the overlap but — verified by actually measuring `getBoundingClientRect()` on the action bar and the FAB cluster rather than trusting a screenshot — didn't come close to eliminating it. The real cause: `.app-shell` reserved bottom clearance as *extra padding at the very end of a normally-scrolling document*. That only actually clears the FABs once you've scrolled all the way to a page's true end — for a page whose content is roughly one screen tall (the Pads page's 3×3 grid plus the action bar), that point is below the fold and never visibly reached, so real content renders directly under the fixed FABs at the ordinary, default scroll position. Measured proof: `document.documentElement.scrollHeight` (753px) exceeded the viewport (664px) by almost exactly the reserved padding amount (92px) — meaning the reserved space existed, just entirely past where anyone would naturally see it.

**Fix**: `.app-shell` is now itself a bounded, `position: fixed` box — `top` pinned below the nav, `bottom` pinned above the FAB/PlayBar band — with its own `overflow-y: auto`, instead of letting the whole document scroll under fixed overlays. This makes the overlap structurally impossible rather than probabilistically rare: content can never render outside the box's own edges, regardless of how tall it is or how far it's scrolled, because the box's bottom edge *is* the top edge of the reserved FAB band, always. Verified by scrolling the region to its end on all three pages (Pads, Sequencer, Library) and confirming zero pixel overlap between the action bar and the FAB cluster.

**Flipped the action-bar emphasis.** `.action-mute`/`.action-effects` now carry the accent outline+text even at rest (previously only when toggled on); `.action-edit`/`.action-library` are now plain-bordered/neutral-text (previously always accent-colored). Also added a pencil icon to Edit, which previously had none while the other three buttons did — an inconsistency surfaced by actively redesigning this row.

**Empty pads and instrument badges** (the two "your call" / "recommended" items): empty pads now show a faint tint of their own color (`${pad.color}1f`, an alpha-suffixed hex) instead of a fully transparent/hollow outline, with a "+" glyph instead of the word "EMPTY." The instrument badge changed from a repeated generic icon (every key showing the same emoji, telling you nothing about which key was which) to the key's actual 1-based position — `PadGrid` now builds a `sampleId → keyNumber` map instead of `sampleId → icon`, so the grid visibly reads as an ordered keyboard once an instrument is applied, not nine identical-looking tiles.

### Alternatives considered
- **Reserve horizontal space instead of fixing the scroll architecture** (give the action bar's right column extra margin so it can't reach under the FABs) — this was one of the options offered, but the user picked FAB consolidation instead; investigating why consolidation alone didn't fully work is what surfaced the deeper scroll-architecture bug, which a purely horizontal patch wouldn't have touched at all (the overlap is vertical/positional, not just "too close to the right edge").
- **A cycling grid-mode button** (tap to step Off → Loop → Instrument → Off) instead of a menu — rejected: cycling past the mode you want on a mis-timed tap is a common annoyance with cycle-through controls, and Instrument Mode already needs its own picker step regardless, so a menu that leads into that picker is a smaller total number of interaction patterns to learn than a cycle *plus* a separate picker.
- **Margin-bottom on `.selected-pad-bar` alone**, without touching `.app-shell`'s architecture — tried in reasoning before implementation and rejected on paper: margin-bottom on the last element doesn't move it earlier in the document flow, so it can't prevent this specific class of overlap (content sitting near the bottom of the *initial* viewport) — it only makes the total page taller.

### Reasoning
The FAB overlap had been patched twice before this round (once via `--fab-height` padding, once by hoping FAB-count reduction would be enough) without anyone measuring *why* it kept coming back. Actually querying `getBoundingClientRect()` on the real elements — rather than eyeballing a screenshot or trusting that "less padding needed = less overlap" — took a few minutes and turned a third patch into a real fix. The general lesson for this app's fixed-chrome-over-scrolling-content pattern: a `position: fixed` overlay can only be guaranteed to never collide with scrollable content if the scrollable region's own boundary excludes the overlay's footprint — reserving space at the *end* of an open-ended scrolling document doesn't give that guarantee for any page whose content height happens to land near a viewport-height multiple, which is common, not an edge case.

### Outcome
Full verification: `tsc -b`, `vite build`, `oxlint` (same three pre-existing warnings), `vitest run` (61/61, unchanged — this was a UI/layout round, no reducer changes). Playwright verification: measured real `getBoundingClientRect()` coordinates before and after the `.app-shell` fix (confirmed zero overlap after, on all three pages, both at the default scroll position and scrolled to the region's end); confirmed the grid-mode menu opens/closes and correctly shows "current" state per mode; confirmed the FAB cluster is back to 3 buttons; confirmed instrument badges show distinct key numbers (1-9 for a Piano instrument applied to a 9-pad grid) instead of repeated icons; confirmed the Library button is fully visible and clickable with no interception. Zero console errors. `project.md` updated: a new "Scroll architecture" Layout bullet explaining the fixed/bounded `.app-shell` design and why the old padding approach didn't work, the FAB-cluster/Pads-page/mode-related bullets rewritten for the single grid-mode button and the re-weighted action bar, and stale "Edit →" wording fixed to plain "Edit" throughout.

### Open questions / carried forward
- The volume mixer and bounce-to-pad-from-the-sequencer remain queued.
- Autosave's per-write full sample re-encode and everything else carried from prior entries remain open and unchanged.
- A large new batch of requests arrived mid-round (Sequencer redesign as a wide-screen "music sheet" with per-row library swapping and add-row support; a richer, metadata-showcasing grid UI for the Library; loop-defaulted playback after a recording finishes; a new "record a playthrough of your loops and gates into a combined beat" mode) — not yet scoped or started; next step is the same screenshot-plus-clarifying-questions treatment this round used, since several parts are genuinely ambiguous (e.g. how "record a playthrough of loops and gates" differs from the just-shipped Instrument Mode performance capture).

---

## 2026-09-07 — Playthrough recording, sample kind taxonomy, loop-preview, pad waveforms

### Context
First chunk of the new request batch (Sequencer, Library, and Recording changes) — the recording-related parts, since the Library redesign depends on the sample taxonomy decided here, and this round could ship as a clean, fully independent unit ahead of the bigger Sequencer/responsive-layout work. Four clarifying questions went out first; the ones this round acts on: "capture everything actually playing" (a real live-mix recording, not an extension of the discrete hit-capture) for the playthrough-recording ask, and "derive from what we already know" for the Library's sample "type" metadata. A late add: "use the waveform to add more information" on both Library and Pads.

### Decision(s)
**Playthrough recording supersedes the Instrument Mode hit-capture shipped two rounds ago, rather than living alongside it.** The chosen design ("capture everything actually playing... works with any pads, not just instrument-mode ones") is strictly more general than the offline discrete-hit render Instrument Mode triggered — it also captures sustained loops, which discrete hits never could — so keeping both would have meant two parallel, overlapping recording paths for no real benefit. Deleted `engine/bounce.ts` and `AudioEngine`'s `startPerformanceCapture`/`logPerformanceHit`/etc. entirely, along with the capture-logging code in `PadButton` (a nice simplification — `PadButton` no longer needs to know recording exists at all).

**New mechanism**: every playback node (`playBuffer`'s two destination-bound gains, previously `ctx.destination` directly) now connects to a lazily-created `masterBus: GainNode` instead. `AudioEngine.startPlaythroughRecording()` taps that bus with `ctx.createMediaStreamDestination()` and records the resulting stream with a plain `MediaRecorder` — the exact same capture mechanism `useRecorder.ts` already uses for the microphone, just fed a synthetic Web Audio stream instead of `getUserMedia`, which means it needs zero microphone permission. `stopPlaythroughRecording()` mirrors `useRecorder`'s stop/flush/resolve pattern. The metronome click and a recording-review preview loop (see below) both deliberately keep connecting straight to `ctx.destination`, bypassing the master bus — a click track and a "is this a good take" preview are monitoring aids, not part of the beat, and would be an accidental, confusing artifact in a playthrough capture.

**A new, independent `Transport.playthroughRecordingEnabled` toggle** (its own small FAB, `PlaythroughToggle`), deliberately *not* folded into the `GridModeButton` menu and *not* mutually exclusive with loop/instrument mode — recording a playthrough of loops you've already started, or of an instrument you're playing live, is the entire point, so the two axes (what tapping a pad does vs. what holding Record captures) had to stay independent. `RecordFAB` now branches on this flag instead of on `padInstrumentModeEnabled`.

**`Sample.kind: 'recording' | 'note' | 'sequence'`** — added to the data model and threaded through every construction site (`RecordingReview.commit()`, `InstrumentLibrary.buildKeySamples()`) plus both serialization paths (`projectFile.ts`, `autosave.ts`, both defaulting `?? 'recording'` for pre-existing saved data). Deliberately derived from *how* a sample was made — a plain mic take, an instrument key, or a bounced multi-hit performance — rather than attempting any audio-content analysis, per the chosen answer. `PendingRecording` gained an optional `kind` field so `RecordFAB` can tag mic recordings `'recording'` and playthrough captures `'sequence'` before they ever reach `RecordingReview`.

**Loop-defaulted playback after recording**: a new `AudioEngine.previewLoop(buffer)` — a bare `AudioBufferSourceNode` with `loop = true`, no effects, connected straight to `ctx.destination` (not the master bus, and not tracked as a pad — just a raw preview), added to `activeSources` so the panic "stop all sounds" button can still silence it. `RecordingReview` starts one automatically on mount and tears it down on unmount or when a new pause/play toggle button (next to the waveform) turns it off — the loop keeps going through naming/deciding, exactly matching "add a playback defaulted to loop after finishing a recording."

**Waveform backdrops, per the late "use the waveform to add more information" note**: every filled pad on the Pads page now shows a faint (30% opacity) waveform silhouette behind its number and instrument badge, reusing the existing `StaticWaveform` component and the sample's already-computed `peaks` — a quick "which sound is this" visual, not just a color and a number. (The Library's own richer waveform-forward redesign is queued for the next round, once the grid layout itself is rebuilt.)

### Alternatives considered
- **Extending the Instrument-Mode hit-capture to also log loop start/stop events**, rather than switching to a live master-bus tap — this was one of the two options put to the user; rejected in favor of the more general live capture, which also sidesteps a real correctness gap the extended-hit-log approach would have kept: discrete offline-rendered hits can't represent an indefinitely sustained loop without inventing an arbitrary cutoff duration.
- **Folding Playthrough into the `GridModeButton` menu** as a fourth radio option — rejected: it's genuinely a different axis (what recording captures, not what tapping a pad does), and radio-button "Off/Loop/Instrument/Playthrough" would have implied mutual exclusivity that isn't real — Playthrough needs to combine freely with either grid mode.
- **A single toggle button badge nested on the record FAB itself** to switch mic/playthrough, instead of a separate FAB — rejected on touch-precision grounds, the same reasoning that's moved every other small control off the pad face and record FAB in this app: nesting a tiny secondary tap target inside an already-tappable 60px circle is exactly the pattern this project avoids.
- **Real audio-content analysis for the Library's "type" and "characteristics" fields** — rejected (per the user's own answer) as unreliable engineering effort for a lightweight app; the source-derived `kind` plus simple computed facts (duration, peak level — arriving in the Library-grid round) covers the same ground more honestly.

### Reasoning
Routing all playback through one `masterBus` (rather than connecting a `MediaStreamAudioDestinationNode` per playback node, or trying to enumerate "everything currently playing" node-by-node) means playthrough recording required touching exactly two connection call sites in `playBuffer`, and automatically captures anything added to the graph in the future without further changes — the same "never rewire the topology" instinct already behind Filter's allpass-at-zero and Grit's identity-curve-at-zero design. Superseding rather than layering the two recording mechanisms kept `RecordFAB` and `PadButton` simpler than they were two rounds ago, not more complex, despite the new capability — deleting `engine/bounce.ts` outright (rather than leaving it as unused-but-available) matches the project's standing rule against half-finished, unreferenced code paths.

### Outcome
Full verification: `tsc -b`, `vite build`, `oxlint` (same three pre-existing warnings), `vitest run` (62/62 — one new reducer test for playthrough recording's independence from the grid mode, plus the existing `makeSample` test helper updated for the new required `kind` field). Playwright pass (9 checks): a mic recording's review popup defaults to a playing preview with a working pause/play toggle; a filled pad shows its waveform backdrop; turned on Loop Mode and started pad 1 looping; turned on Playthrough and held Record (via a synthetic pointer event, confirming no microphone-permission prompt blocks it) while pad 1 looped, releasing to a "Playthrough 2" review popup; kept it in the library and confirmed both samples now present. Zero console errors throughout, including through the novel `MediaRecorder`-on-`MediaStreamAudioDestinationNode` path. `project.md` updated: a new Playthrough recording subsection, the loop-preview and `kind`-taxonomy bullets under Recording & the Sample Library, the FAB-cluster and Pads-page Layout bullets, and `SampleKind`/`Sample.kind`/`Transport.playthroughRecordingEnabled` added to the Data Model.

### Open questions / carried forward
- Still queued from the new request batch: the Library grid redesign (waveform-forward, showing kind/duration/loudness at a glance), the Sequencer redesign (continuous-timeline restyle, per-row library swap, add-row), and the whole-app responsive layout (Pads + Sequencer side by side on wide screens) — next up, in that order, since the Library grid is now unblocked by this round's `kind` taxonomy.
- The volume mixer, bounce-to-pad-from-the-sequencer, autosave's per-write full re-encode, and everything else carried from prior entries remain open and unchanged.

---

## 2026-09-07 — Library grid redesign

### Context
Second chunk of the new request batch, unblocked by the previous round's `Sample.kind` taxonomy: "make a nice easily navigable UI that showcases at a glance: nature/length/characteristics/type of sound" plus "I like the grid thing going on so maybe a grid to choose from" and "use the waveform to add more information."

### Decision(s)
Replaced `.library-list` (a plain vertical list of rows) with `.library-grid`, a `repeat(auto-fill, minmax(150px, 1fr))` grid of cards. Each card leads with a large `StaticWaveform` (reusing the exact peaks data already computed at record time — no new analysis) above a compact facts row: a kind badge (🎤 Recording / 🎹 Note / 🥁 Sequence, from last round's `Sample.kind`), duration (`sample.buffer.duration`, already on hand), and a loudness descriptor. New `utils/sampleInfo.ts` holds the small, pure helpers for all of this — `sampleKindIcon`/`sampleKindLabel`, `formatSampleDuration`, and `sampleLoudness` (a three-bucket Quiet/Medium/Loud threshold over `Math.max(...peaks)`, per the "derive from what we already know" decision from two rounds ago — no waveform-analysis library, no new dependency). Rename, reorder, Assign…, and Delete are unchanged in behavior, just laid out inside a card instead of a row.

### Alternatives considered
- **A richer "characteristics" descriptor** (e.g. attempting to distinguish percussive vs. tonal content) — stayed rejected per the earlier decision; loudness-from-peaks is honest about what it actually measures rather than implying more analysis than exists.

### Reasoning
Nothing here needed new data — `kind` (last round), `buffer.duration` (always been on the `AudioBuffer`), and `peaks` (computed at record time for the old list's thumbnails already) were all already sitting in `Sample`. The whole round was a presentation change, which is exactly why it could ship fast right after the taxonomy round that unblocked it.

### Outcome
Full verification: `tsc -b`, `vite build`, `oxlint` (same three pre-existing warnings), `vitest run` (62/62, unchanged — no reducer/data changes this round). Playwright pass: recorded a mic sample and built a Piano instrument, confirmed 17 cards rendered in the grid, confirmed both "Recording" and "Note" kind badges appear with their icons, confirmed duration/loudness facts render on every card. Visual check via screenshot confirmed the 2-column card layout, prominent waveforms, and readable facts row. Zero console errors. `project.md`'s Library-page Layout bullet rewritten for the card grid.

### Open questions / carried forward
- Still queued: the Sequencer redesign (continuous-timeline restyle, per-row library swap, add-row) and the whole-app responsive layout (Pads + Sequencer side by side on wide screens) — next up.
- The volume mixer, bounce-to-pad-from-the-sequencer, autosave's per-write full re-encode, and everything else carried from prior entries remain open and unchanged.

---

## 2026-09-07 — Sequencer redesign, responsive wide-screen layout, and a real portal bugfix

### Context
Final chunk of the new request batch: the Sequencer as "a stretch of the current music sheet" with wide-screen support, per-row library swapping, and the ability to add rows — plus the "whole app goes responsive" and "continuous timeline look" answers from the earlier clarifying round.

### Decision(s)
**Sequencer restyled toward a continuous timeline**: `.step-group` gained a real `border-left` bar line between beat groups (rather than only the existing background tint) and tighter intra-group gaps, and `.step.current` now glows (an outer `box-shadow` blur plus the existing inset ring) instead of just outlining — reads more like a DAW piano-roll strip, less like a plain checkbox grid, without touching the underlying step data model at all.

**Per-row library swap and add-row**, both small, mechanism-reusing additions: each row's color swatch is now a `<button>` (was a `<span>`) that opens the exact same `PadLibraryPicker` the Pads page uses — no new picker component, just a second place that opens it. "+ Add row" dispatches the existing `SET_VISIBLE_PAD_COUNT` action with `visiblePadCount + 1`, the same reducer path Settings' pad-count stepper already used, disabled at `MAX_PAD_COUNT`.

**Whole-app responsive layout**: a new `useIsWideScreen` hook (`matchMedia('(min-width: 900px)')` via `useSyncExternalStore`, so it only re-renders on an actual breakpoint flip, not every resize tick) drives `App.tsx`'s `CurrentPage`: above the breakpoint, selecting either "Pads" or "Sequencer" shows both side by side in a new `.wide-split` grid, since those are the two screens actually used together while playing — Library stays a full-width page regardless of width, since it's a browsing screen, not a performance one. `.app-shell`'s own max-width grows from 560px to 1100px at the same breakpoint to give the two columns room. `showPlayBar` now also accounts for the wide case (visible whenever the Sequencer is showing, which on a wide screen includes while the Pads tab is selected).

**Found and fixed a real, pre-existing stacking-context bug while verifying the above** — not a regression from this round's own changes, but one that had been quietly possible since the FAB-overlap structural fix two rounds ago and only became reliably reproducible now because the Sequencer's full-width PlayBar covers far more of the screen than the FAB cluster's corner ever did. `.app-shell` being `position: fixed` (needed for the earlier fix) makes it its own stacking context per spec; any popup opened from a button *inside* a page component — which is most of them — was a DOM descendant of `.app-shell` and so had its z-index trapped inside that context, meaning it could be visually and interactively painted *underneath* a fixed sibling (the FAB cluster, the PlayBar) despite its own z-index being much higher. Playwright's actionability check caught it immediately on the new per-row swap popup: "element intercepts pointer events," with the BPM slider reported as the actual top element at the Cancel button's coordinates — a real browser reproducing exactly what a tap would hit. Fixed properly, not patched around: a new shared `<Overlay>` component wraps every popup's content in `createPortal(..., document.body)`, so none of them are ever DOM descendants of `.app-shell` regardless of which component opens them. Migrated all five existing overlay call sites (`RecordingReviewOverlay`, `SettingsOverlay`, `PadEditOverlay`, `PadLibraryPicker`, and `GridModeButton`'s two inline popups) to it, removing five copies of the same `overlay-backdrop`/`overlay-sheet`/`stopPropagation` boilerplate in the process.

### Alternatives considered
- **Giving the trapped popups a still-higher z-index** — doesn't work and was never seriously on the table: z-index values only compete within the nearest stacking context, so no number fixes a popup trapped inside a lower-stacked ancestor's context.
- **Reverting `.app-shell` to non-fixed positioning** to sidestep the stacking-context trap — rejected: that would resurrect the exact FAB-overlap bug the fixed-positioning change was written to solve two rounds ago. Portaling the popups is the fix that keeps both properties true at once.
- **A cross-row absolutely-positioned playhead line** for the timeline look, instead of per-cell glow — considered, dropped for now on effort-to-payoff grounds: computing exact pixel offsets across the two different gap sizes (intra-group vs. inter-group) is fiddlier than it looks and the per-cell glow already reads as "this is where we are" without it.

### Reasoning
The portal bug is a good illustration of why "verify with a real browser, not just unit tests" keeps paying off in this project: `SET_VISIBLE_PAD_COUNT`/reducer logic for add-row was correct in isolation, but the popup that surfaces it (the per-row swap) exposed an unrelated, pre-existing structural issue that no reducer test could have caught, because it's purely about DOM nesting and CSS stacking contexts — exactly the kind of bug that only shows up when something actually renders and a real pointer-event dispatch either lands on the right element or doesn't. Fixing it as a shared `<Overlay>` primitive (rather than patching the one popup that happened to expose it) means every future popup gets the fix automatically, and the five call sites got shorter in the process.

### Outcome
Full verification: `tsc -b`, `vite build`, `oxlint` (same three pre-existing warnings), `vitest run` (62/62, unchanged — this round didn't touch reducer logic). Playwright pass (7 checks) across two viewports: on mobile, confirmed no side-by-side layout, the per-row swap popup opens from a row's color swatch, and "+ Add row" increases the row count by one; on a 1280px-wide viewport, confirmed the side-by-side Pads+Sequencer layout appears on the Pads tab, both are genuinely visible together, the PlayBar shows there too, and Library still renders full-width instead of split. The portal fix was verified by reproducing the original failure first (the exact Playwright error naming the BPM slider as the intercepting element) and then confirming the same click succeeds cleanly after the fix. Visual screenshots confirmed the bar-line/glow timeline restyle and the wide two-column layout. Zero console errors throughout. `project.md` updated: the Sequencer and new Wide-screen-layout Layout bullets rewritten, and a new Infrastructure & Logic Notes bullet documenting the portal architecture and why it was needed.

### Open questions / carried forward
This closes out the large multi-part request batch (Sequencer, Library, Recording) that arrived mid-session. Remaining open items, all carried from earlier rounds:
- The volume mixer (pads-become-sliders grid mode) and bounce-to-pad-from-the-sequencer remain queued, next up whenever the user returns to them.
- Autosave's per-write full sample re-encode (a performance concern, not correctness) remains open.
- The three expected/accepted oxlint `only-export-components` warnings, and any other small items noted in earlier entries, remain unchanged.

---

## 2026-09-07 — Mixer Mode, Bounce to Pad, and Loop Mode gets its own switch

### Context
"get er dooone" — closing out the last two items queued since much earlier in the session (the volume mixer and bounce-sequencer-to-pad), plus a fresh mid-round ask to relocate Loop Mode's control to its own switch. No further clarifying questions this round — enough design groundwork had already been laid (the "separate mixLevel field, own gain stage, live-update method" shape for the mixer was settled several rounds back) to just build it.

### Decision(s)
**Mixer Mode is the pad grid's third mutually-exclusive mode**, alongside Loop and Instrument. `Pad.mixLevel` (0-100, a plain fader — deliberately *not* bipolar like the effect dials, and deliberately a separate field from the Volume effect dial) drives a new `mixGain` node in `AudioEngine`'s per-pad chain, inserted *after* the existing dry/wet mix (`gain`/`wet` both feed into it) so it scales a pad's whole output — echo tail included — not just its dry signal. All three trigger paths (`triggerPad`/`toggleLoop`/`triggerStep`) now pass `pad.mixLevel` through; a new `updateLoopingPadMixLevel` live-updates a currently-looping pad's actual gain while dragging, the same pattern every other dial's live-update already follows. While Mixer Mode is on, `PadGrid` renders a completely different tile per pad — a new `MixerPadFader` component (a colored fill + percentage readout) instead of `PadButton` — since dragging a fader and tapping-to-play are different enough interactions that overloading one component for both would have been messier than branching at the grid level.

**Bounce to Pad** renders the *current pattern as programmed* — not a live capture, unlike Playthrough recording, and not a log of manual presses, unlike the (now-removed) Instrument Mode hit-capture — since a programmed 16-step pattern's timing is already exact data: for each active step, `offsetSeconds = stepIndex * secondsPerStep` is computable directly from the pattern and BPM, no listening or playing-out required. New `engine/bouncePattern.ts` walks every visible, unmuted pad's steps, builds the same effect-chain wiring `AudioEngine.playBuffer` uses live (a third copy of this wiring now, alongside `AudioEngine` itself and the synth-key renderer — accepted again as the established "small decoupled offline module" shape rather than extracting a shared abstraction, matching this project's low-ceremony bar), and renders through `OfflineAudioContext`, respecting each hit's mute/trim/effects/mix-level exactly as they'd actually sound. A "Bounce to Pad" button next to "+ Add row" on the Sequencer, disabled when the pattern has no active steps, feeds the result through the same review popup (name it, assign, or keep in library) every other recording uses — tagged `kind: 'sequence'`, completing the pad → beat → sequence → pad cycle the whole app's "core idea" was built around from the very first round.

**Loop Mode relocated to its own switch**, per a fresh mid-round request: a two-tap "open the grid-mode menu, then pick Loop Mode" was too much friction for a mode this central. New `LoopModeSwitch` — a real switch visual (a track with a sliding thumb, built from two nested spans, not just a button that changes color) with a loop glyph — sits top-right of the Pads panel header, dispatching the same `SET_PAD_LOOP_MODE_ENABLED` action the old menu item did. `GridModeButton`'s menu now offers only Off / Instrument Mode / Mixer Mode; its own FAB icon still shows the loop glyph when Loop Mode is active (via the switch) so it's visually clear at a glance why Instrument/Mixer are greyed out, even though Loop Mode itself is no longer one of the menu's own options.

### Alternatives considered
- **Extracting a shared effect-chain-building function** usable by both `AudioEngine` (live) and `bouncePattern.ts`/`synth.ts` (offline), since all three now duplicate the same node-wiring — considered given this is the third occurrence, but deferred: `BaseAudioContext` does make such an abstraction technically feasible (both `AudioContext` and `OfflineAudioContext` implement it), but `AudioEngine`'s version also needs to return live-updatable node references for the loop-editing dials, which the offline versions don't — the abstraction would need to serve two different callers with genuinely different needs, and "get er done" was the explicit steer this round, not a refactor pass.
- **Letting Mixer Mode's faders also play the pad on tap** (a quick preview while adjusting) — rejected: the point of a dedicated mixing surface is adjusting levels *while something's already playing* (a pattern or existing loops), and retriggering a one-shot on every tap while dragging would fight with that rather than help it.
- **Keeping Loop Mode as a fourth grid-mode-menu item too**, in addition to the new switch — rejected as redundant UI for the same state; one control per piece of state stays simplest, and the FAB's icon already communicates loop-mode-is-active without needing to also list it as a selectable option.

### Reasoning
Both Mixer Mode and Bounce to Pad turned out to be almost entirely composition of things the app already had: mixer mode's gain stage is one more node in a chain that already had five; its live-update method is a one-line variant of five nearly-identical existing methods; bounce reuses `trimToPlaybackWindow`, every `dialMapping.ts` function, and the review-popup pipeline verbatim. The one genuinely new idea — computing exact hit timing from step data instead of capturing it — is also the simplest of the three "turn pad activity into a sample" mechanisms this app now has (Instrument Mode's now-removed hit-log, Playthrough's live tap, and this), because a program is already timing data; nothing has to be observed to know when it happens.

### Outcome
Full verification: `tsc -b`, `vite build`, `oxlint` (same three pre-existing warnings), `vitest run` (64/64 — two new reducer tests: mixer mode's three-way mutual exclusivity, and `SET_PAD_MIX_LEVEL` clamping to 0-100). Playwright pass (12 checks): confirmed the Loop Mode switch renders in the Pads header and toggles the grid's loop-mode outline; confirmed Loop Mode no longer appears in the grid-mode menu; built and assigned a sample, turned on Mixer Mode and confirmed all 9 pads render as faders, dragged one to a specific level and read back the percentage; turned Mixer Mode off and confirmed pads return to normal; confirmed the Bounce button is disabled on an empty pattern and enables once a step is programmed; bounced a single-step pattern and confirmed the resulting sample is tagged `Sequence` in the Library grid. Visual screenshots confirmed the switch's track-and-thumb look and the faders' colored-fill/percentage presentation. Zero console errors. `project.md` updated: the Pad Playback Behavior modes section rewritten for three mutually-exclusive modes, the FAB-cluster/Pads-page/Sequencer Layout bullets updated for the relocated switch and the new Bounce button, and `Pad.mixLevel`/`Transport.padMixerModeEnabled` added to the Data Model.

### Open questions / carried forward
- Autosave's per-write full sample re-encode (a performance concern, not correctness) remains open.
- The three expected/accepted oxlint `only-export-components` warnings remain unchanged.
- No other items are currently queued — this closes out every explicitly-requested feature from this session.

---

## 2026-09-08 — Housekeeping pass, and a whole-grid effects menu

### Context
"Try to tidy things up and do some housekeeping" — a full audit pass rather than new features, followed mid-round by one fresh ask: "find a way to get effects going for the whole pad... an effects toggle that can open up a menu for the whole pad effects."

### Decision(s)
**Housekeeping audit, three checks**: (1) `git status` and a scan for stray files, `console`/`debugger` statements, `TODO`/`FIXME` comments, and unused devDependencies — all clean, nothing found. (2) A CSS dead-code cross-reference (every `index.css` class name checked against `className` usage across every `.tsx` file) — 168 classes defined, zero orphans (5 apparent misses were all comment-text references to filenames, not real class names). (3) A field-by-field scan of `Pad` for anything set but never read — found one: `Pad.icon: string`, assigned at creation (`String(index + 1)`) but never rendered or read anywhere; removed from both `types.ts` and `defaults.ts`, confirmed clean with `tsc -b` afterward. The three existing `only-export-components` oxlint warnings (`AppStateContext`/`EngineContext`/`NavigationContext`, each exporting both a component and a hook from the same file) were re-examined and explicitly left as-is again — fixing them means splitting three files into six across 31 import call sites for a Fast-Refresh-only benefit with zero runtime effect, not worth the diff churn especially with new feature work landing the same round.

**Whole-grid effects menu**: a new `PadEffectsMenuButton` sits next to `LoopModeSwitch` in the Pads panel header — a small round "FX" icon button, matching the header's existing always-visible-controls pattern rather than living inside the grid-mode FAB's menu (this isn't a pad-grid *mode*, it's a one-shot bulk action, so it doesn't belong in that mutually-exclusive-modes machinery at all). Opens an `Overlay` offering three bulk actions, each new reducer cases scoped to `visiblePadCount` exactly like `APPLY_INSTRUMENT_TO_PADS` already does: **apply an effect preset to every visible pad** (`APPLY_EFFECT_PRESET_TO_ALL_PADS`, reusing the same four `EFFECT_PRESETS` and touching only Filter/Grit/Echo, same as the single-pad preset buttons), **bypass or restore every visible pad's effects together** (`SET_ALL_PADS_EFFECTS_BYPASSED`), and **reset every visible pad's dials to neutral** (`RESET_ALL_PADS_EFFECTS`). Applying a preset or resetting asks for confirmation first if any visible pad already has a non-neutral dial — the same overwrite-confirm pattern `GridModeButton`'s instrument picker already established — since either overwrites per-pad customization across the whole grid in one tap; bypass/restore never confirms, since it's fully reversible and touches no stored dial values. All three live-update any pad that's currently looping by calling the exact same `AudioEngine` methods (`updateLoopingPadEffect`, `updateLoopingPadEffectsBypass`) the single-pad dial editor already uses, just once per affected pad instead of once.

### Alternatives considered
- **Putting this inside `GridModeButton`'s existing menu** — rejected: that menu is specifically for the three mutually-exclusive pad-grid *modes* (what a tap on a pad means). A bulk effects action isn't a mode — nothing about how pads respond to taps changes — so folding it in there would have muddied what that menu is for.
- **A single combined confirm-then-apply flow for every bulk action, including bypass** — rejected: bypass/restore is exactly as reversible as the existing per-pad bypass toggle already is (no data is overwritten, just a boolean flip), so gating it behind a confirmation would have been friction for a fully-safe action, inconsistent with how the single-pad version already works.

### Reasoning
Every piece of this feature is deliberately a bulk-scoped copy of a mechanism the app already had for one pad at a time: the same presets, the same bypass semantics, the same live-loop-update calls, the same overwrite-confirm UX, the same `visiblePadCount`-scoped reducer pattern `APPLY_INSTRUMENT_TO_PADS` established. Nothing here needed new audio-engine logic or a new confirmation idiom — just plumbing the existing single-pad actions across an array of pads.

### Outcome
Full verification: `tsc -b` (clean), `oxlint` (same three pre-existing, explicitly-accepted warnings, nothing new), `vitest run` (67/67 — three new reducer tests: preset-to-all scoped to `visiblePadCount` with pitch/speed/volume left untouched, bypass-all/restore-all, and reset-all scoped correctly with a hidden pad's dial left untouched), `vite build` (clean). Playwright pass on a 390×844 mobile viewport: confirmed the FX button renders next to the Loop Mode switch; opened the menu and applied a preset with no pads yet customized (applies immediately, no confirm, button flips to its "on" visual state afterward); reopened and picked a second preset with pads now customized (confirmation prompt appears, cancel leaves values untouched); toggled bypass-all (menu item label flips from "Bypass all pads' effects" to "Restore all pads' effects"). Zero console errors throughout. `project.md` updated: a new Pad Playback Behavior bullet documents the feature, the Pads-page Layout bullet mentions the FX button, the stale `icon` field is gone from the `Pad` interface in Data Model, and the opening-the-app usage-flow bullet's stale "icon changes" phrasing was corrected to describe the actual empty/filled visual (tint + "+" hint vs. waveform + number).

### Open questions / carried forward
- Autosave's per-write full sample re-encode (a performance concern, not correctness) remains open.
- The three expected/accepted oxlint `only-export-components` warnings remain unchanged, explicitly re-confirmed this round.
- No other items are currently queued.

---

## 2026-09-08 — More instruments, more effect presets, two new effect dials

### Context
"can you add more instruments and more effect presets and more sliders to change the effects" — a direct, three-part expansion request, no clarifying questions needed since each part had an obvious shape to grow into given the existing patterns (bundled synth patches, the character-dial preset list, the per-pad dial array).

### Decision(s)
**Four new bundled instrument presets** — Pad, Pluck, Organ, Bell — added to `engine/synth.ts`'s `INSTRUMENT_PRESETS` alongside the existing Piano/Bass/Lead (7 total now). Each is a distinct oscillator-plus-envelope patch built from fields the `SynthPatch` shape already had (no new synthesis code needed): Pad is a slow-attack, long-sustain sine wash for holding a background loop; Pluck is a near-instant-decay triangle for a snappy one-off hit; Organ layers a loud octave overtone onto a square wave for a thick, buzzy sustain; Bell is a bright sine with a slow-decaying overtone for a struck-metal character. `instrumentIcon.ts`'s preset-name-to-glyph map got four new entries so none of them fall back to the generic "built instrument" icon. Both the Library's preset-button row and the Instrument Mode picker are already generic over `INSTRUMENT_PRESETS`, so no UI code needed to change to surface them.

**Four new effect presets** — Radio, Lo-Fi, Crunch, Slapback — added to `EFFECT_PRESETS` alongside Telephone/Underwater/Vinyl/Cavern (8 total). The four existing presets also picked up a `reverb` value (mostly 0, except Underwater's subtle 25 and Cavern's full 100 — Cavern's "big empty space" character now leans on real reverb instead of only echo). Every preset-consuming call site — the single-pad preset row on `PadEditPage`, the whole-grid `PadEffectsMenuButton`, and the `APPLY_EFFECT_PRESET_TO_ALL_PADS` reducer case — updated their fixed `['filter', 'grit', 'echo']` lists to include `'reverb'`.

**Two new effect dials — Pan and Reverb — bringing the per-pad effect count from six to eight.** Both follow the exact structural pattern every existing dial already established (a pure `dialMapping.ts` function, an always-wired graph node so the topology never changes, a case in `updateLoopingPadEffect` for live updates, a label/description pair on `PadEditPage`), so nothing about *how* dials work needed rethinking, just two more of them:
  - **Pan → `StereoPannerNode.pan`**, a plain linear -1..1 mapping — the one dial in the app that's genuinely one-directional rather than "two textures either side of neutral," since a stereo position doesn't have two characters the way muffled/thin or crush/drive do. Wired in *after* Mixer Mode's `mixGain`, so it positions the pad's whole finished output (echo and reverb tails included) rather than just the dry signal.
  - **Reverb → `ConvolverNode`**, following Echo's established "one effect, two textures" bipolar shape: negative is a small, tight room (short decay), positive is a large, spacious hall (long decay), 0 is dry. The room comes from a synthesized impulse response (`buildReverbImpulse` — decaying white noise, generated on the fly) rather than a recorded one, keeping with the app's "everything synthesized, no audio assets" rule. Wired as a parallel convolution branch off the same dry `gain` node Echo already branches from, mixed back in alongside it. `buildReverbImpulse` takes a `BaseAudioContext` rather than `AudioContext` specifically, so the identical function works unchanged from both `AudioEngine`'s live context and `bouncePattern.ts`'s `OfflineAudioContext` — both call sites needed the same pan/reverb wiring added for the offline bounce to stay sonically accurate to what's actually played.

### Alternatives considered
- **Making Reverb's preset field optional** (only newer presets would set it) — rejected: `EffectPreset.reverb` is a required field like `filter`/`grit`/`echo`, so every preset (old and new) states its reverb value explicitly rather than leaning on an implicit default, keeping the preset list self-describing at a glance.
- **A one-directional 0-100 "wet amount" for Reverb**, matching how reverb usually reads in other tools — rejected in favor of the bipolar small-room/large-hall split, since every other "space/character" dial in this app (Filter, Grit, Echo) already uses the same "two textures either side of neutral" idea, and a plain wet-only reverb would have been the odd one out rather than reading as part of the same dial family.
- **A shared effect-chain-building function** to stop `AudioEngine.playBuffer` and `bouncePattern.ts` from duplicating the pan/reverb wiring a fourth and fifth time — considered again (same tradeoff noted in earlier rounds for the original chain), still deferred for the same reason: `AudioEngine`'s version needs to return live-updatable node references the offline version doesn't.

### Reasoning
All three asks turned out to be pure extension of existing, already-generalized machinery: instruments are data in an array a couple of UI surfaces already iterate over generically; presets are data in another such array; dials are entries in `EFFECT_IDS` that `PadEditPage` already renders generically from `Record<EffectId, ...>` maps. The only genuinely new code was the two dial mappings themselves (`dialToPan`, `dialToReverbParams` + `buildReverbImpulse`) and their graph wiring — everything else was adding rows to lists the app was already built to grow.

### Outcome
Full verification: `tsc -b` (clean), `oxlint` (same three pre-existing, already-accepted warnings), `vitest run` (74/74 — 7 new: `dialToPan`, `dialToReverbParams`, and `buildReverbImpulse`'s length/decay-shape behavior in `dialMapping.test.ts`, plus the bulk-preset reducer test extended to assert `reverb` is applied and `pan` is left alone). `vite build` clean. Playwright pass on a 390×844 viewport: confirmed all 7 instrument presets (including the 4 new ones) appear in the Library's "New from preset" row; built a Bell instrument and laid it across the grid via Instrument Mode; opened a pad's editor and confirmed all 8 dial rows render (Volume/Speed/Pitch/Filter/Pan/Grit/Echo/Reverb) and all 8 effect presets appear in the row above them; dragged the new Pan and Reverb sliders and confirmed their values update and display correctly; applied the new "Crunch" preset and confirmed Filter/Grit updated together; confirmed the whole-grid FX menu (from the housekeeping round) also shows all 8 presets, since it reads from the same `EFFECT_PRESETS` array. Zero console errors throughout. `project.md` updated: the Instruments section lists all 7 presets with one-line character descriptions, the Dials/Controls section documents Pan and Reverb's mappings and the Data Model's `EffectId` type, and the effect/preset counts throughout (Usage Flow, Architecture Foundations) updated from six/four to eight/eight.

### Open questions / carried forward
- Autosave's per-write full sample re-encode (a performance concern, not correctness) remains open.
- The three expected/accepted oxlint `only-export-components` warnings remain unchanged.
- No other items are currently queued.

---

## 2026-09-08 — A Guitar preset, and a real synthesized Drum Kit

### Context
"I need drums and guitar" — a follow-up to the previous round's instrument expansion. Guitar slotted straight into the existing pitched-preset shape; drums didn't, and needed a moment's thought before building.

### Decision(s)
**Guitar** is a straightforward eighth entry in `INSTRUMENT_PRESETS`: a lowpass-softened sawtooth (root E3, `lowpassHz: 3500` to tame the sawtooth's harshness) with a quick pluck-then-settle envelope (`decaySeconds: 0.4`, `sustainLevel: 0.15`) and a touch of `overtoneGain` for shimmer — built entirely from `SynthPatch` fields the other seven presets already use, no new synthesis code.

**Drum Kit is a genuinely different kind of preset, not just a ninth entry in the same list.** Every existing preset — including Guitar — is one patch pitch-shifted across 16 keys (`renderSynthNote` + semitone offsets): that works because a piano note an octave up still sounds like the same piano. A drum kit breaks that assumption entirely: a kick pitched up 15 semitones doesn't sound like a snare, it sounds like a pitched-up kick. So each of a kit's 16 keys needs to be an independently-synthesized, differently-timbred voice, not a semitone offset of one root sound. New `engine/drumSynth.ts` defines a fixed `DrumVoice[]` list (`DRUM_KIT_VOICES` — Kick, Snare, Closed/Open Hat, Low/Mid/High Tom, Clap, Rimshot, Cowbell, Crash, Ride, a second Kick/Snare variation, Shaker, Tambourine) and `renderDrumVoice()`, which branches by a `kind` discriminant into one of three synthesis families, all classic no-sample drum-machine tricks: **tonal, pitch-swept** (kick/tom — a sine sweeping down from 4x its root frequency in ~50ms gives the "thump" a plain steady tone wouldn't have), **tonal, bandpassed dual-oscillator** (cowbell — two square oscillators at an inharmonic ~1.48 ratio through a bandpass), and **filtered noise with a decay envelope** (snare/hi-hat/rim/crash — differing only in highpass cutoff and decay length; snare adds a low triangle "thump" under the noise for body, and clap uniquely layers three quick noise bursts 12ms apart instead of one smooth decay, since a hand-clap is several near-simultaneous slaps, not a continuous sound). `InstrumentLibrary.tsx` got a `handleBuildDrumKit` alongside `handleBuildFromPreset`, since the two build paths take different inputs (`buildDrumKitKeys()` needs no preset argument, unlike `buildInstrumentKeysFromPreset(preset)`) — but the Drum Kit button sits in the exact same preset-button row, and applying it to the pad grid goes through the identical Instrument Mode flow as any pitched instrument, so from the pads' perspective it's just another instrument (pad 1 = Kick, pad 2 = Snare, and so on down the fixed voice order).

**`buildKeySamples` (in `InstrumentLibrary.tsx`) changed from taking a `namePrefix` string to taking a `labels: string[]` array**, since a pitched instrument's keys all number off one name ("Piano 1", "Piano 2", ...) but the drum kit's keys each need their own real name ("Kick", "Snare", ...) — both call sites now build their own label list (`${name} ${i + 1}` for pitched instruments, `DRUM_KIT_VOICES.map(v => v.name)` for the kit) before calling the now-generic helper.

### Alternatives considered
- **Extending `InstrumentPreset` with an optional per-key patch array** instead of a wholly separate module — considered, rejected: `InstrumentPreset.patch: SynthPatch` and `rootHz: number` are both fundamentally singular (one patch, one root), and bolting a "or, alternatively, 16 patches and no root" branch onto that shape would have made every consumer of `InstrumentPreset` (the Library's preset-button map, `buildInstrumentKeysFromPreset`) need to branch on which shape it got. A separate `DrumVoice[]`/`buildDrumKitKeys()` pair keeps both shapes simple at the cost of one extra button-wiring path in `InstrumentLibrary.tsx`.
- **A real drum-sample library instead of synthesis** — never on the table: the project's foundational rule is no bundled audio assets, everything synthesized (see the existing pitched presets and Reverb's synthetic impulse response) — a drum kit is the one place that rule is hardest to satisfy convincingly with plain oscillators/noise, but breaking it for drums alone would have been inconsistent with how every other bundled sound in this app is made.
- **Giving Guitar a second, detuned oscillator for a chorus-y unison width** (closer to a real strummed guitar's texture) — deferred: `SynthPatch` has no "second detuned oscillator" concept, only the existing `overtoneGain` (a quieter octave-up sine, used by Piano/Organ/Bell); adding a new field for one preset alone felt like scope creep for a "distinct enough to tell apart" casual synth, not a serious guitar model.

### Reasoning
The pitched presets and the drum kit are two answers to the same underlying question — "how do I get a useful sound onto a key with no audio assets" — that happen to need different shapes of answer once you actually think about what "spread across 16 keys" means for each: pitched material tolerates transposition, percussion timbre doesn't. Recognizing that up front (rather than trying to force drums through the pitch-shift path and getting something that sounds like a detuned kick on every key) is what made the rest straightforward — every individual drum voice is itself a small, well-known synthesis recipe (pitch-swept sine for kick/tom, filtered noise for everything else), none of it novel.

### Outcome
Full verification: `tsc -b` (clean), `oxlint` (same three pre-existing, already-accepted warnings, nothing new), `vitest run` (74/74, unchanged — `drumSynth.ts`'s actual rendering needs a real `OfflineAudioContext`, same reason `synth.ts`'s `renderSynthNote`/`buildInstrumentKeysFromPreset` were never unit-tested either; `DRUM_KIT_VOICES`' pure data wasn't given a dedicated test for the same reason `EFFECT_PRESETS`/`INSTRUMENT_PRESETS` never were), `vite build` clean. Playwright pass on a 390×844 viewport — the real test for this round given the untestable-in-Vitest rendering: confirmed both Guitar and Drum Kit appear in the Library's preset row (9 buttons total now); built both with zero console/page errors; confirmed the Drum Kit's 16 keys render as visually distinct waveform shapes in the sample library (not 16 identical pitch-shifted copies); applied the Drum Kit to the pad grid via Instrument Mode and confirmed pads 1-9 show Kick-through-Rimshot's actual distinct envelope shapes; tapped the Kick and Snare pads directly and confirmed real playback triggers with no errors; opened Pad 1's editor and confirmed its trim waveform matches the Kick's fast-decay shape. `project.md` updated: the Instruments section documents Guitar's patch and the Drum Kit's separate synthesis approach and voice list, and the Data Model's `Instrument.keySampleIds` comment now notes the drum kit's fixed-voice-order exception to "ordered by pitch."

### Open questions / carried forward
- Autosave's per-write full sample re-encode (a performance concern, not correctness) remains open.
- The three expected/accepted oxlint `only-export-components` warnings remain unchanged.
- No other items are currently queued.

---

## 2026-09-08 — Instrument Mode gets its own dedicated header button

### Context
"move instrument mode somewhere else in the pads like a dedicated button somewhere and make it just the icon of an instrument keep the confirmation for replacing pads with it" — pulling Instrument Mode out of the grid-mode FAB's menu into an always-visible control, mirroring what Loop Mode already got a few rounds back, with an explicit instruction to keep the overwrite-confirmation step intact.

### Decision(s)
**New `InstrumentModeButton.tsx`** — a plain round icon-only button (the same piano-keys glyph the grid-mode FAB used to show for this mode), placed in the Pads panel header alongside `LoopModeSwitch` and `PadEffectsMenuButton`. Unlike Loop Mode's switch, this isn't a bare on/off flip: turning Instrument Mode on always has to ask "which instrument?" first (no implicit "whatever was there before" — an existing, explicit design rule this round didn't touch), so the button's click handler branches on current state: **off → tap opens the instrument picker** (same overlay, same list, same overwrite-confirmation dialog when any pad already has a sound — moved verbatim, not rebuilt); **on → tap turns Instrument Mode off directly**, no picker needed since there's nothing left to ask. Disabled (with an explanatory tooltip) whenever no instrument exists yet and it's currently off — turning off never needs that gate, since off doesn't depend on having an instrument.

**`GridModeButton.tsx` shrank to just Off/Mixer Mode.** All of the instrument-picker state (`pickingInstrument`, `confirmInstrumentId`), handlers (`openInstrumentPicker`, `applyInstrument`, `handlePickInstrument`), and the picker `<Overlay>` itself moved to the new component wholesale — GridModeButton no longer imports `instrumentIcon` or needs the `instruments`/`anyPadFilled` derived values at all. The FAB's mode-detection and icon-display logic is untouched: it still computes `mode` from all three transport flags and still shows the piano-keys icon when Instrument Mode is active, exactly the same treatment Loop Mode already got when *it* moved out — the FAB's icon has always been "whichever mode is actually on," independent of whether that mode is selectable from its own menu.

### Alternatives considered
- **Making the new button double as a mini on/off switch like LoopModeSwitch** (matching its exact `role="switch"` visual) — rejected: Instrument Mode turning on is never a bare toggle, it's "pick an instrument, then it's on," so a switch's implied "flip and you're done" semantics would misrepresent what tapping it while off actually does. A plain icon button that opens a picker (or turns off directly, symmetrically) reads more honestly.
- **Leaving Instrument Mode's off-path also going through a picker/menu** (for consistency with how it always required a picker before) — rejected: turning off has no decision to make, so gating it behind any UI beyond a single tap would be pure friction with no benefit, and directly contradicts the "less friction" reason this whole move exists for.

### Reasoning
This is a near-exact repeat of the Loop Mode extraction from a few rounds ago — pull an always-reached-for pad-grid mode out of a menu into its own header control, keep the FAB's icon reflecting it, keep the reducer's mutual-exclusivity untouched since none of that logic lives in the UI layer. The one real design decision was what "tap while on" should do, since Instrument Mode (unlike Loop Mode) isn't naturally a toggle — resolved by keeping the picker exclusively on the "turning on" path and making "turning off" a plain, immediate action.

### Outcome
Full verification: `tsc -b` (clean), `oxlint` (same three pre-existing, already-accepted warnings), `vitest run` (74/74, unchanged — this move is pure UI relocation with no reducer/engine changes). `vite build` clean. Playwright pass on a 390×844 viewport: confirmed the grid-mode FAB's menu now lists only Off/Mixer Mode; confirmed the new instrument button is disabled before any instrument exists and enables once one's built; confirmed tapping it while off opens the picker directly (no menu detour); confirmed tapping it while on turns Instrument Mode off immediately with no picker; confirmed picking an instrument on an empty grid applies with no confirmation, while re-picking on an already-filled grid still shows the "Replace every pad's current sound with this instrument?" confirm-overwrite prompt, unchanged from before the move. Zero console errors. Also fixed a small pre-existing stale doc comment in `PadsPage.tsx` noticed in passing (it referenced `GridModeButton` for Loop Mode's control, which actually moved to `LoopModeSwitch` several rounds ago). `project.md` updated: the Pad Playback Behavior and Layout sections both rewritten to describe Instrument Mode's new dedicated button and the grid-mode FAB's now-Mixer-Mode-only menu.

### Open questions / carried forward
- Autosave's per-write full sample re-encode (a performance concern, not correctness) remains open.
- The three expected/accepted oxlint `only-export-components` warnings remain unchanged.
- No other items are currently queued.

---

## 2026-09-08 — Gate-by-default, and Instrument Mode's button always usable

### Context
Two "why" questions about existing behavior, answered directly first, then turned into change requests: "why is instrument not press able" (the dedicated button is disabled until at least one instrument exists) and "why is gate not the default for tap" (a quick tap always played through in full; only a hold past ~200ms gated it). Follow-up: "yep" to both, then a more specific ask via a clarifying question — make gate the default, *and* make the Instrument button always usable by having it build an instrument on press and remove it from the library again when Instrument Mode turns off.

### Decision(s)
**Gate is now the only playback style for a non-loop-mode pad.** `PadButton`'s pointer handlers lost the whole hold-threshold mechanism (`GATE_HOLD_THRESHOLD_MS`, `gatedRef`, `gateTimerRef`, the setTimeout that flipped gating on after 200ms) — `handlePointerUp`/`handlePointerCancel` now unconditionally stop whatever's playing via a single `stopActiveSource()` helper, regardless of how long the press lasted. A quick tap-and-release now cuts the sample short, same as a slightly-longer hold always did; there's no longer a "quick enough to play through in full" carve-out.

**`InstrumentModeButton` is always pressable now — no instrument has to exist first.** Its picker splits into two sections: **Quick presets** (every bundled synth preset plus Drum Kit, always available) and, once any exist, **Your library** (instruments already built via the Library page). Picking a quick preset builds it fresh right there (the same `buildInstrumentKeysFromPreset`/`buildDrumKitKeys` offline renders the Library page already uses) and applies it to the grid; picking from Your library applies an existing one directly, building nothing. Since a quick-built instrument only exists for this one performance, turning Instrument Mode back off *through this same button* removes it (and its generated key samples) from the library again — but only if it's the one *this button* built; applying something from Your library is never auto-removed, tracked via a new `Transport.autoInstrumentId: string | null` (set on a quick build, cleared — and the pointed-at instrument removed — on the next "off," and cleared without a removal if you instead apply something from Your library). Also cleared defensively inside the `REMOVE_INSTRUMENT` reducer case itself, whenever the instrument being removed (by any path, not just this button) happens to be the currently-tracked one — so a stale pointer to an already-gone instrument can't linger.

**A shared `buildKeySamples` helper** moved out of `InstrumentLibrary.tsx` into a new `utils/buildInstrumentSamples.ts`, since `InstrumentModeButton` needed the exact same "wrap rendered buffers into real library Samples" logic for its own quick-build path — worth extracting once a second real caller existed, unlike the icon-SVG/audio-node-wiring duplication elsewhere in this app that's deliberately kept apart. A small `instrumentIconForName(name)` helper was added alongside the existing `instrumentIcon(instrument)` in `utils/instrumentIcon.ts`, since the Quick presets list only has a preset's name at picker-render time, not a full `Instrument` object to hand the existing function.

### Alternatives considered / a bug caught and fixed along the way
- **First implementation tracked the auto-built instrument's id in `InstrumentModeButton`'s own `useState`** — this looked right in isolation but failed the very first real-browser check: navigating away from the Pads page and back (Library → Sequencer → Pads) unmounts and remounts `InstrumentModeButton`, silently discarding that local state while `state.transport.padInstrumentModeEnabled` (real app state) stayed `true` and the quick-built instrument stayed applied. Turning Instrument Mode off after such a round-trip then failed to clean up — the instrument sat in the library forever, exactly the clutter this whole feature exists to prevent. Moving the tracking into `Transport.autoInstrumentId` (real reducer state, unaffected by which components happen to be mounted) fixed it outright; Playwright's "navigate away and back before turning off" repro is now a permanent regression check. This is the second time in this project a real bug only surfaced once a real browser reproduced an actual navigation/remount sequence, not a unit test.
- **Persisting `autoInstrumentId` through autosave/project-file export** — rejected in favor of resetting it to `null` on every load, the same treatment `isPlaying`/`currentStep` already get. Reasoning: once a project has been explicitly saved, any instrument it contains is project data the user chose to keep, not something still owed a silent auto-delete the next time Instrument Mode happens to toggle off after reloading.
- **Keeping a hold-threshold but shortening it** (e.g. gate after 50ms instead of 200ms) instead of removing the concept entirely — not seriously considered: the ask was for gate to be the default, meaning every tap, not a smaller minimum hold before gating kicks in.

### Reasoning
The gate change is a pure behavior flip with no new mechanism — deleting code, not adding it, since "always gate" needs less state than "gate only after a timer." The Instrument button change looked like a small UX tweak but exposed a real correctness bug in the previous round's implementation: local component state is the wrong place for anything that needs to survive this app's page-based navigation, a lesson this project has now hit twice (the FAB overlap/stacking-context bugs were the first class of "only a real browser catches this," this is the second — both were structural facts about this app's architecture, not edge cases).

### Outcome
Full verification: `tsc -b` (clean), `oxlint` (same three pre-existing, already-accepted warnings), `vitest run` (77/77 — three new reducer tests: `SET_AUTO_INSTRUMENT_ID` sets and clears the id, `REMOVE_INSTRUMENT` clears it when the removed instrument matches, and leaves it alone when a *different* instrument is removed). `vite build` clean. Playwright pass on a 390×844 viewport: confirmed a 60ms tap-and-release on a pad no longer shows "playing" 400ms later (previously it would have played through in full); confirmed the Instrument button opens its picker with zero instruments built yet (previously disabled); confirmed quick-building Piano applies it and adds it to the library; **confirmed the navigation-survival fix directly** — quick-built Piano still shows as applied after Library → Sequencer → Pads, and turning Instrument Mode off at that point correctly empties the library again; confirmed a deliberately-built Bass instrument (via the Library page) appears under "Your library" in the picker, applies without rebuilding, and survives turning Instrument Mode off afterward. Zero console errors throughout. `project.md` updated: Pad Playback Behavior's loop-off bullet and the Usage Flow's Step 4 both rewritten for gate-as-default, Instrument Mode's bullet rewritten for the Quick-presets/Your-library split and auto-cleanup, `Transport.autoInstrumentId` added to the Data Model, the Saving section's transient-state bullet updated, and two other small stale spots fixed in passing (the Pad edit popup's dial list still said six dials from before the Pan/Reverb round).

### Open questions / carried forward
- Autosave's per-write full sample re-encode (a performance concern, not correctness) remains open.
- The three expected/accepted oxlint `only-export-components` warnings remain unchanged.
- No other items are currently queued.

---

## 2026-09-08 — Grid-mode FAB retired, Pad Record made visible, per-voice instrument icons, bounce overlap fixed, library decluttered, Clear Sequence

### Context
Five separate asks arrived across one continuous exchange: (1) "pad grid mode needs to disappear, that button needs to go elsewhere" and "make pad record mode distinctly somewhere visible" (two clarifying rounds were needed — the first pinned down that Mixer Mode's control should join the Pads header like Loop/Instrument Mode already had; the second, on what "pad record mode" meant, got a free-text answer describing the record→perform→stop→edit flow rather than confirming a location, so the actual relocation-and-styling design below is my best-fit read of that, flagged as such rather than guessed silently); (2) "we need icons for what instrument part is assigned... if it's something like drums and keys if it's something like piano"; (3), sent mid-turn, "bouncing to pad shouldn't play the sequence... it'll play over a current loop and get messy"; (4) "notes of instruments shouldn't appear in the library, turning pads into instruments should be a quick in and out"; (5) "there needs to be a clear sequence button."

### Decision(s)
**The grid-mode FAB is gone.** `GridModeButton.tsx` deleted outright. Its only remaining job (Mixer Mode had already lost Loop and Instrument Mode to their own header controls in earlier rounds) became a new `MixerModeButton.tsx` — a bare on/off icon toggle in the Pads header, no menu needed since Mixer Mode has nothing to ask before turning on, unlike Instrument Mode.

**Pad Record (the renamed-in-UI `PlaythroughToggle`) moved from the floating record cluster into the Pads header too**, restyled to always show the same "record" red the mic button uses — not just once toggled on — specifically so it reads as part of the recording family at a glance instead of blending in with the header's other blue/accent mode toggles. The Pads header is now five controls plus a divider: Instrument Mode, Loop Mode, Mixer Mode | Pad Record, FX — the divider marking "what tapping a pad does" (the three modes) apart from the two that aren't modes at all (what *recording* captures; a bulk *effects* action). The floating cluster is down to just Metronome and Record.

**Instrument-key badges now carry an identifying glyph, not just the key number.** For the Drum Kit specifically — the one bundled instrument whose 16 keys are genuinely different sounds — each pad shows a distinct icon per voice kind (🥁 kick, 🪘 snare, ✨ hi-hat, 🛢️ tom, 👏 clap, 🎯 rimshot, 🛎️ cowbell, 💥 crash), computed from `DRUM_KIT_VOICES[keyIndex].kind` rather than by matching a sample's (renameable) label. For every pitched preset or recording-based instrument, every key shows that instrument's own single glyph (`instrumentIcon()`, already built for the instrument pickers) repeated across all 16 — correct, since those keys really are the same sound pitch-shifted, unlike the kit's.

**A `RecordingReview` popup no longer auto-loops a `kind: 'sequence'` recording.** Both a Bounce-to-Pad render and a Playthrough capture are near-certainly built from pads/loops that are still audibly playing when the popup opens — auto-starting a preview loop on top of that (the existing default behavior, there for a plain mic take's instant feedback) was exactly the "plays over a current loop and gets messy" the user flagged. The play/pause button is untouched; only the auto-start default changed, gated on `recording.kind !== 'sequence'`.

**`Library.tsx`'s sample grid now excludes `kind: 'note'` samples.** They're still real Samples in `state.samples` (pads reference them exactly as before), but building even one 16-key instrument was flooding the Library page with 16 individual cards it has no business showing — they're already managed as a unit via the Instruments list above (delete the instrument, its keys go with it). One added `.filter()` in the page's sample list.

**A "Clear Sequence" button** sits beside "Bounce to Pad" — a new `CLEAR_PATTERN` reducer action zeroes every pad's step array in the current pattern (not just visible pads — the whole `pattern.steps` map, since hidden pads' steps are still real data), gated behind a confirm prompt (`btn-ghost-danger`, matching the app's existing destructive-action styling) and disabled when the pattern has no active steps, same guard `patternHasSteps` already provided for Bounce.

**`RecordingReview` also gained a post-assign "Edit this pad" step** (bundled into this round since it's the same review-flow surface as the auto-preview fix): assigning a recording to a pad no longer closes the popup immediately — it shows "Assigned to Pad N. Want to dial it in now?" with **Edit this pad** (jumps straight into that pad's editor via `useNavigation().goToEditPad`) or **Done** (closes, unchanged from before). This was my interpretation of the free-text "pad record mode" answer's actual content (an edit step after record→perform→stop), offered as a best-fit addition rather than left undone given the ambiguity.

### Alternatives considered
- **Keeping a small Mixer Mode FAB instead of moving it to the header** — this was explicitly offered as an option and the header placement was explicitly chosen instead, for consistency with Loop/Instrument Mode's existing treatment.
- **Renaming `PlaythroughToggle` to a `PadRecord` component/file** — deferred: only its rendered label/title text and CSS class changed to "Pad Record"/`.playthrough-btn`; the component name, transport field (`playthroughRecordingEnabled`), and all the underlying recording mechanism stay exactly as documented in earlier rounds, since none of that changed — only where and how it's shown.
- **Matching a drum voice's icon by its sample label** instead of by key index into `DRUM_KIT_VOICES` — rejected: labels are user-renameable (`RENAME_SAMPLE`), so a label-based lookup would silently break the moment someone renamed a key sample; indexing into the fixed voice list by position is stable regardless of renaming.
- **Filtering `kind: 'note'` samples out of `state.sampleOrder` entirely** (not just the Library page's display) — rejected: other pickers (like `PadLibraryPicker`, used to manually assign a specific sample to a specific pad) still show them deliberately, since being able to hand-place one exact drum voice or piano note onto a chosen pad is a real, useful capability the user didn't ask to lose. Only the main Library *grid* — the one that reads as "your sample collection," not "everything referenceable" — hides them.

### Reasoning
Every one of these was either finishing work an earlier round left half-done (Mixer Mode kept behind a menu after its siblings moved out; instrument-key badges showing only a number when the Drum Kit round had already made per-key identity genuinely meaningful data) or a straightforward case of "a mechanism built for one purpose collides when reused for another" (RecordingReview's auto-preview loop, built for judging a quick mic take, actively fighting a live mix when reused for bounce/playthrough review). None of these needed new architecture — the reducer gained one small, focused action (`CLEAR_PATTERN`), and everything else was UI relocation, a filter, and a lookup table.

### Outcome
Full verification: `tsc -b` (clean), `oxlint` (same three pre-existing, already-accepted warnings), `vitest run` (78/78 — one new reducer test for `CLEAR_PATTERN` clearing every tracked pad's steps). `vite build` clean. Playwright pass on a 390×844 viewport: confirmed the grid-mode FAB is gone from the floating cluster; confirmed Mixer Mode toggles from its new header button; confirmed the Pad Record button is present, distinctly red-bordered, and toggles; confirmed a Drum Kit applied to the grid shows differentiated per-voice icons (kick/snare/hi-hat/tom/clap/rimshot all visually distinct) while a Piano instrument shows the same 🎹 on every key; confirmed the Library page shows zero sample cards after building a Piano instrument (Instruments (1), Library (0)); confirmed "Clear Sequence" is disabled with no steps programmed, enabled once one is, and correctly zeroes the grid after the confirm prompt. Zero console errors throughout. `project.md` updated across five sections: Pad Playback Behavior (mode-control relocation, per-key icon rules), Layout's FAB-cluster and Pads-page bullets (rewritten for the new five-control header), the Sequencer bullet (Clear Sequence, bounce's no-auto-preview behavior), Recording & the Sample Library (the edit-step, the sequence-kind auto-preview exception, the note-sample exclusion), and the Library page bullet (note samples never shown there).

### Open questions / carried forward
- The "pad record mode" clarifying question's free-text answer was interpreted as a request for a post-assign edit step in the recording review flow — flagged to the user as an interpretation, not a confirmed spec; worth a follow-up check that this actually addressed what they meant.
- Autosave's per-write full sample re-encode (a performance concern, not correctness) remains open.
- The three expected/accepted oxlint `only-export-components` warnings remain unchanged.
- No other items are currently queued.


---

## 2026-09-08 — Simplify the Library to samples only

### Context
After reviewing the live mobile UI, the Instruments panel occupied the top of the Library page before a user could reach their recordings and bounced sequence samples. The user asked to remove that section for now.

### Decision(s)
Removed the Instruments panel from the Library page. The page now opens directly on the sample-card library. Existing instrument data, generated note samples, and the Pads-page Instrument Mode picker remain unchanged, so this is a UI-surface removal rather than deletion of instrument capabilities or user-created instruments.

### Alternatives considered
- Delete the instrument model and its generated samples — rejected; that would be destructive and would also break the existing Instrument Mode flow.
- Move instrument controls elsewhere in Library — rejected for now; the goal is a clean, sample-focused Library, and the Pads page already owns applying instruments to the grid.

### Reasoning
Library is the natural place to browse and manage playable recordings, while Instrument Mode is a performance/grid concern. Separating them makes the first Library screen faster to scan on a phone without reducing the current instrument workflow.

### Open questions / carried forward
Whether instruments eventually need a dedicated management surface outside Library can be revisited if the existing Pads-page picker becomes insufficient.


---

## 2026-09-08 — Transient Instrument Mode assets and mobile swipe navigation

### Context
With the Instruments panel removed from Library, the remaining desired interaction is that Instrument Mode's generated key samples stay out of the sample library and do not persist once that performance is over. The mobile Pads and Sequencer screens also need a direct gesture for moving between the two primary performance surfaces.

### Decision(s)
- Quick instruments created from Instrument Mode presets remain transient. Their 16 generated note samples are already excluded from the visible sample-card library; now they are also removed whenever Instrument Mode is turned off, replaced, or disabled by switching to Loop or Mixer Mode.
- Previously saved instruments are deliberately preserved as project data and remain selectable from the Instrument Mode picker; only quick builds created for the current performance are cleaned up.
- On narrow screens, a horizontal swipe left from Pads opens Sequencer; a horizontal swipe right from Sequencer returns to Pads. The gesture requires at least 72px of horizontal travel and must be more horizontal than vertical, preserving ordinary vertical scroll and taps.

### Alternatives considered
- Keeping quick-built instruments until a manual delete — rejected; that leaves invisible generated samples consuming saved-project space after they are no longer useful.
- Removing all instruments indiscriminately when mode changes — rejected; saved instruments are an explicit project asset and should not disappear without user intent.
- Adding swipe navigation between every tab, including Library — deferred; Pads and Sequencer are the adjacent, high-frequency performance workflow, while Library is a distinct browsing surface.

### Reasoning
Instrument keys need to be real Samples while assigned to pads because the existing engine and pad model operate on sample references. Treating them as temporary implementation data after that performance ends provides the same musical workflow without turning the Library into hidden long-lived asset storage. A constrained horizontal gesture makes one-handed mobile movement between playing and sequencing immediate without competing with the page's vertical scroll.

### Open questions / carried forward
None.


---

## 2026-09-08 — Keep temporary instruments out of pad browsing; preserve Mixer pad content

### Context
The main Library hid generated instrument-key samples, but the Pads-page “Library” picker still showed the raw sample order. Separately, cleaning up a temporary quick instrument after switching to Mixer Mode cleared the generated keys without restoring the sounds they had replaced.

### Decision(s)
- The Pad Library picker now filters out `kind: 'note'` samples exactly like the main Library page. It exposes reusable recordings and bounced sequences, not internal generated keys.
- A temporary Instrument Mode preset snapshots the visible pads’ original sample IDs and trim windows before it overlays its keys. On cleanup, those assignments are restored before the generated instrument and its key samples are removed.
- Added reducer coverage for the Mixer-mode sequence: original pad sound and trim return, the temporary key file is deleted, and Mixer Mode remains enabled.

### Reasoning
The same word—Library—must mean the same user-facing collection everywhere. Generated keys are implementation detail for an active instrument layout, while Mixer Mode is strictly a control surface and must not destroy that layout.

### Open questions / carried forward
None.


---

## 2026-09-08 — Instrument key count drives the pad grid

### Context
Applying a 16-key instrument to the default smaller pad grid only exposed the pads that already happened to be visible, leaving part of the keyboard unreachable.

### Decision(s)
Applying an instrument now sets the visible pad count to its key-sample count and appends ordinary pad slots/pattern rows when needed. Existing hidden pad assignments are included in the temporary-instrument snapshot before they are overlaid, so later cleanup restores them safely.

### Reasoning
An instrument’s number of rendered keys is the authoritative shape of its playable layout. The grid should represent the full selected instrument, rather than truncating it to an unrelated prior pad-count setting.

### Open questions / carried forward
None.


---

## 2026-09-08 — Mixer Mode keeps the current instrument sound

### Context
The first temporary-instrument cleanup rule treated Mixer Mode entering as “the instrument is no longer used.” In practice Mixer Mode is a fader surface for the very sounds currently on the pads, so turning it on or off must preserve those sounds.

### Decision(s)
Removed automatic temporary-instrument cleanup from generic grid-mode transitions. Quick instrument cleanup now occurs only when the user explicitly turns Instrument Mode off through its control, or when a new instrument replaces it. Loop and Mixer Mode can be entered and exited freely without changing pad sample assignments.

### Reasoning
Mutual exclusivity here is about a pad’s gesture vocabulary—play/gate, loop toggle, or fader—not the ownership or validity of the pad’s current sound. Treating a UI interaction mode as asset lifetime was the wrong boundary.

### Open questions / carried forward
None.


---

## 2026-09-08 — Non-destructive instrument replacement and level-matched presets

### Context
After a quick instrument was laid across the pads, tapping Instrument Mode again still treated that tap as an off action and cleared the active layout before a replacement could be chosen. The procedural preset models also had materially different output levels, particularly between transient-heavy and sustained voices.

### Decision(s)
- Instrument Mode now always opens its picker. With a quick instrument active, the current pad assignments remain untouched until the user chooses and confirms a replacement; replacing a quick preset still removes its superseded generated key samples.
- Every generated preset key, including the offline-rendered Lead and Pad voices, now receives RMS normalisation to a shared target, capped by a safe peak ceiling.

### Reasoning
The Instrument button is a fast selection surface, not a destructive toggle: an active instrument should make choosing a different one immediate. RMS matching is more useful than peak-only limiting for musical consistency because it aligns the usable average level of percussive and sustained models while retaining headroom against clipping.

### Open questions / carried forward
None.


---

## 2026-09-08 — Mixer overlays rather than deselects an instrument

### Context
Even after generated key data was retained, entering Mixer Mode deselected Instrument Mode. The fader view also stripped every instrument key marker from the pads. Together that looked indistinguishable from deleting the active instrument and made returning to performance mode feel destructive.

### Decision(s)
- Mixer Mode now overlays an active Instrument Mode selection instead of turning it off. Leaving Mixer returns directly to the same instrument-enabled pad layout, with the same sample assignments.
- Mixer faders retain each pad's instrument-key marker, so their identity remains visible while setting levels.
- Reopening the picker from an active quick instrument and choosing a replacement now applies it directly; it does not require an intermediate clear or overwrite confirmation.

### Reasoning
Mixing changes levels, not the selected sound source. Keeping the current keyboard layout explicit in both state and the fader UI makes the transition reversible and legible, while direct replacement matches the Instrument button’s intended fast workflow.

### Open questions / carried forward
None.


---

## 2026-09-08 — Real recorded electric-guitar source with resilient fallback

### Context
The original Guitar preset was a procedural Karplus-Strong-style string. A first attempt to improve it with a public Wavebase recording was not viable in-browser: GitHub's raw URL served a Git LFS pointer rather than WAV bytes, so the app always fell back to synthesis.

### Decision(s)
- Guitar now uses three verified CC0 recorded electric-guitar zones from the Black And Green Guitars / MAESTRO String Studio pack, hosted as actual browser-decodable WAVs.
- The E3–G4 pad range is built from the nearest of those recordings with offline semitone shifts. This preserves the changing string/pickup character across the neck without downloading sixteen independent files.
- Decoded source zones and their rendered pad keys are cached per session. A failed network load clears that cache entry for a later retry, while the existing procedural guitar remains the non-blocking fallback.
- All rendered keys pass through the shared RMS/peak safety normalization.

### Reasoning
A small, vetted multisample set produces a more credible guitar than a single physically modelled voice while remaining appropriate for a lightweight browser app. Verifying the delivery bytes—not merely a source URL or license—is essential because Git LFS pointers cannot be decoded by Web Audio.

### Open questions / carried forward
The other instruments remain intentionally procedural; future real-sample additions should follow the same licensing, byte-verification, cache, fallback, and loudness-normalization checklist.


---

## 2026-09-08 — Recorded Bass and full-tail pitch rendering

### Context
After validating the real Guitar loader, Bass remained oscillator-based despite an equally suitable CC0 multisample source. The shared pitch-shift utility also assumed all shifts ascended; downshifting a recorded source into the lowest note could truncate its release at the source buffer length.

### Decision(s)
- Bass now uses three verified CC0 Growlybass recording zones, choosing the nearest source before rendering each of its 16 notes.
- Offline pitch rendering now expands the destination buffer for downward shifts, preserving the complete note and release.
- Both Guitar and Bass retain their tuned procedural voices as automatic fallbacks when their recorded sources are unavailable.

### Reasoning
The two string instruments benefit most from recorded attack and resonance. Nearest-zone selection minimizes pitch-shift artifacts, and full-tail rendering is required for a credible low-register decay.

### Open questions / carried forward
None.


---

## 2026-09-08 — Master output volume and explicit Gate/One-shot pads

### Context
Pad Mixer Mode controls balance between individual pads, but the app had no single listening-level control. The Pads header also contained a Pad Record control even though the desired immediate performance choice is whether a pad release gates sound or a tap lets the full file play.

### Decision(s)
- Added a persistent Master Volume control beside Metronome. It controls the final audio output after pad effects and Mixer faders, and applies live without changing any saved per-pad mix level.
- Replaced the Pads-header Pad Record control with an explicit Gate / One-shot toggle. Gate is the default: release stops the source. One-shot lets each tap play the complete trimmed sample.
- Older autosaves hydrate to Master Volume 100% and Gate mode, so the new fields cannot alter a saved project unexpectedly.

### Reasoning
Source balance and total listening level solve different problems and need separate controls. A visible named playback-mode toggle makes an important timing choice intentional, while preserving the familiar gate behavior by default.

### Open questions / carried forward
None.


---

## 2026-09-08 — Sequencer cells retain their original sound

### Context
A sequencer row can be reassigned from one sound to another after notes have already been programmed. Previously its cells were boolean gates, so playback and bounce always read the row's current pad sound and silently rewrote the earlier musical decision.

### Decision(s)
Each sequencer cell now stores either `null` or the precise sample ID that was on the pad when that cell was added. The playback scheduler and Bounce to Pad renderer resolve that stored reference, not the pad's later assignment. For example, a step entered as Piano 1 remains Piano 1 after the pad is changed; a subsequent step can be Guitar 1.

Older project files and browser autosaves with boolean cells are migrated on load: each prior `true` becomes the sound that was assigned to that pad at migration time. If a transient Instrument Mode asset is dismissed while a pattern still references one of its key samples, that otherwise-hidden asset is retained as sequence backing data so the historical cell remains playable.

### Reasoning
A programmed pattern is musical history, not a live view of the pad grid. Capturing the source at entry time makes sound replacement additive and predictable while still allowing current pad mix, effects, trim, and mute controls to shape the row as a whole.

### Open questions / carried forward
None.


---

## 2026-09-08 — Direct pad growth and bounce placement

### Context
Bouncing a sequence previously always entered the review flow, which then required choosing a destination. Pad count was adjustable only away from the performance surface.

### Decision(s)
- Added **Bounce to New Pad** beside the existing Bounce to Pad action. It renders the active pattern, saves the rendered sequence, creates or reveals the next pad slot, and assigns the bounce there in one action.
- Added **+ Pad** and **− Pad** controls in the Pads header. Add exposes an empty next pad; remove hides the final visible pad. Removal intentionally preserves its assignment and sequence data, so adding it back restores it unchanged.
- All three controls respect the one-to-sixteen pad limit. The Pad-header control group wraps cleanly on narrow screens.

### Reasoning
A bounce is commonly the next layer of a beat, so it deserves a direct destination that cannot overwrite an existing sound. Keeping grid-size controls next to the grid makes arrangement changes immediate while retaining the app's established non-destructive pad model.

### Open questions / carried forward
None.


---

## 2026-09-08 — Expandable sequencer timeline

### Context
The sequencer was fixed to one 16-step bar. The user asked to add more space to the right of the grid.

### Decision(s)
Each pattern now carries its own length. It starts at 16 steps and can grow in four-step groups, up to 64 steps. A visible **+4** button sits at the right edge of the sequencer header. Added cells are empty and retain every existing programmed step.

The scheduler, one-pass stop point, offline bounce duration, autosave, and import/export all use this per-pattern length. Older projects with no stored length load as their original 16-step patterns.

### Reasoning
A horizontal extension must be part of the pattern data and timing loop, rather than merely additional UI boxes, otherwise later cells could neither play nor appear in a bounce.

### Open questions / carried forward
None.


---

## 2026-09-08 — Sequencer trace, compact controls, and transport stop

### Context
Layering a new beat benefits from seeing an earlier arrangement without hearing or modifying it. Longer timelines also need controls that remain reachable while horizontally scrolling. Finally, pausing the sequencer should not leave audible sources running.

### Decision(s)
- **Trace current** snapshots live placements into a visual-only dashed guide. Clear Sequence leaves the trace visible, allowing a fresh layer to be programmed over it. A trace never triggers playback or enters a bounce, and can be removed with **Clear trace**.
- Pattern length can now also shrink by four cells from the right, down to 16. Removing non-empty trailing cells requires confirmation.
- The +4/−4 length controls and the compact action rail are sticky inside the horizontal timeline.
- Pausing from the Play control invokes the engine's global stop, silencing all current app audio immediately.

### Reasoning
The trace separates reference from performance data, while sticky controls preserve direct manipulation on an expanded timeline. A transport stop should have an unambiguous audible outcome.

### Open questions / carried forward
None.


---

## 2026-09-08 — Imported project wins over delayed autosave

### Context
Loading an older exported JSON could appear to return the app to an earlier session. Startup restoration of the browser autosave decodes asynchronously, which meant it could finish after an explicit import and replace the imported state.

### Decision(s)
The autosave restore now applies only while the initial session state is untouched. Any explicit import or other user edit made before that restore resolves takes precedence, so a loaded project cannot be overwritten by the delayed autosave result.

### Reasoning
Autosave is a startup convenience, whereas loading a project is an explicit user decision. The latter must always win when the two operations race.

### Open questions / carried forward
None.


---

## 2026-09-08 — Immediate transport stop and 32-pad ceiling

### Context
Stopping playback could leave a lookahead-scheduled sequencer hit able to start while React processed the transport update. The pad-count limit was also increased from 16 to 32.

### Decision(s)
- Stop now immediately closes an engine-side sequencer gate, stops every active source, and turns off the metronome. The reducer update then stops the scheduler as usual.
- The maximum visible pad count is now 32. It is enforced by the controls, reducer actions, and imported-project hydration; quick instruments therefore also have up to 32 key slots.

### Reasoning
Audio scheduling runs ahead of UI state by design. A synchronous engine gate prevents an already queued callback from escaping the stop event. A hard state-level cap keeps the intended pad limit reliable even for imported older data.

### Open questions / carried forward
None.


---

## 2026-09-08 — Portable sequence traces and direct arrangement controls

### Context
A bounced sequence was only audio, so it could be replayed but not brought back into the sequencer as a visual reference. The sequence and pad controls also had unnecessary confirmation steps.

### Decision(s)
- Bounced sequence samples now retain a portable boolean placement snapshot. The Library exposes a **Trace** action for those samples; it opens Sequencer and applies the snapshot as the active pattern's visual-only trace. The trace can later be cleared without changing live placements. Snapshots persist through autosave and downloadable project JSON.
- Loading a trace expands the visible pad grid and timeline only as needed, within the 32-pad and 64-step limits. It maps by row position rather than source sample ID, so it remains useful in a different project.
- Removing four steps is immediate. Choosing an instrument applies it directly without an overwrite confirmation.
- Pad growth is capped at 32 and includes an inline **+ Add pad** tile at the end of the pad grid. The Bounce action now has one destination chooser, whose pad picker includes **+ New** as an additional destination.

### Reasoning
A sequence should retain its arrangement information independently from its rendered audio so it can serve as reusable composition reference. The new direct controls preserve non-destructive data behavior while removing friction from frequent performance and arrangement actions.

### Open questions / carried forward
Older sequence samples created before this change contain audio only, so they remain playable but have no trace snapshot to load.


---

## 2026-09-09 — Direct project controls and clearer sound destinations

### Context
Project backup controls were buried in Settings, while frequent sequence/pad actions did not always name their destination clearly. The Pads action surface also split effect editing from its bypass control.

### Decision(s)
- Added distinct **Save** and **Load** controls to the top bar. Browser autosave remains the everyday recovery mechanism and creates no downloaded files; Save is now explicitly the portable JSON backup/transfer action.
- In Sequencer, each row now visibly says **Load**, the add-row affordance is a free row directly underneath the existing grid, and **Save sequence** opens the single destination picker that includes a new-pad option.
- The Pads page uses **Load sound** rather than Library for its pad-assignment action.
- Pad **Edit** is now **Effects**. The previous Effects on/off bypass is a toggle within the opened Effects panel, alongside trims, presets, and individual dials.

### Reasoning
Autosave should cover normal work without accumulating exports. Visible action labels reduce the need to infer where an action leads, and combining editing with effects puts an effect's global bypass beside the controls it governs.

### Open questions / carried forward
None.


---

## 2026-09-09 — Sequence trace as hide/show

### Context
The earlier Trace current action copied a visual guide but left the original sequence live, requiring a separate clear step to achieve a quiet reference layer.

### Decision(s)
**Hide sequence** now moves the active sequence into its visual trace and immediately removes it from playback. **Show sequence** restores that exact sequence to playback. Imported sequence traces remain explicitly reference-only and are never accidentally restored as playable cells.

### Reasoning
A hidden sequence is a reversible arrangement layer, not a second duplicated pattern. Preserving the distinction between hidden local sequences and imported references makes both workflows clear and safe.

### Open questions / carried forward
None.
