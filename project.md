# Beat Maker App — Project Idea

## Summary

A single-page web app that lets you record sound snippets from your mic, build up a library ("arsenal") of them, and turn them into a beat using dial-based controls. Casual, personal-use project — no saving/export needed, no offline requirement. Scope is expected to grow organically over time, so the foundation is built solid even though the current feature set is small.

## Architecture Foundations

These are load-bearing decisions made deliberately so the base doesn't need to be re-poured as features get added later.

- **Language: TypeScript, strict mode.** The pad/sample/pattern/effect shapes are the contract between the audio engine and the UI — TypeScript keeps that contract enforced as both sides grow.
- **Audio engine: a decoupled module, not hooks.** All `AudioContext`, node graph, and scheduler logic lives in a plain TS class/module with no React dependency. React components call its methods and subscribe to its state; they never touch `AudioContext` directly. This means:
  - Audio timing is never at the mercy of a React re-render.
  - The scheduler can be unit-tested in Vitest with zero DOM.
  - The engine can be swapped, extended, or driven from something other than this UI later without a rewrite.
- **State: centralized reducer, not scattered `useState`.** One typed app-state shape (samples, pads, patterns, transport) updated through a reducer via `useReducer` + context. Still "plain React state" as originally scoped — just organized so state changes are traceable actions instead of ad hoc setters spread across components.
- **Data model: headroom built in now.** Effects are modeled as an ordered list per pad, not three hardcoded fields. Patterns are modeled as a collection, not a single hardcoded grid. The UI today only exposes one pattern and three effects (pitch/speed/filter) — but adding a second pattern or a fourth effect later is adding data, not restructuring core state. See **Data Model** below for the concrete shapes.
- **Tooling defaults** (not asked about, applying as sensible defaults for a "don't build flimsy" project): ESLint + Prettier from the start, Vitest for the engine/reducer/scheduler logic, strict `tsconfig`.

## Core Features

### Recording & the Sample Library ("Arsenal")

- Record multiple sound snippets from the device mic.
- Every recording lands in a persistent (session-lifetime) **sample library** — a growing arsenal of snippets, independent of pads.
- After recording stops, you're prompted to assign the new snippet to a pad — but the snippet also stays in the library regardless, so it can be reassigned or reused later.
- Pads **reference** a library sample by ID; they don't own the audio data. Reassigning a pad to a different library sample doesn't delete the old sample — it just changes what that pad points to.
- Also support looping/layering a single snippet on its own.
- Pads triggered by click/tap (no keyboard shortcuts).
- Pad count: adjustable, default 8.

### Pad Playback Behavior

- **Looping pads**: tap to start, tap again to stop (same gesture toggles). One-shot pads always play to completion regardless of taps.
- **Retriggering a one-shot pad**: layers freely — each tap fires a new overlapping playback instance, standard sampler behavior. This is also what naturally happens when a manual tap coincides with a sequencer step firing the same pad; no special-casing needed.
- **Shrinking pad count**: purely a display/trigger-surface control. Data for pads above the new count is retained in state, not deleted, and reappears if the count is grown back. (No confirmation dialog needed since nothing is actually discarded — this only applies to pad *slots*; explicitly deleting a sample from the library or clearing a pad is a separate, deliberate action.)

## Dials / Controls

- Audio effect dials: pitch, speed, filter — per-pad (each pad has its own settings, independent of which library sample it currently references).
  - **Speed → `AudioBufferSourceNode.playbackRate`.**
  - **Pitch → `AudioBufferSourceNode.detune`.** Plain `playbackRate` changes pitch and speed together (it's just resampling) — using `detune` for pitch keeps the two dials genuinely independent without needing a phase vocoder or other heavy DSP. This only works within `detune`'s practical range (a few semitones/octaves); that's an accepted limitation, not a bug.
  - **Filter → `BiquadFilterNode`** (frequency/cutoff mapped from the dial).
- Rhythm dials: beat pattern / step sequencer controls, 16-step grid.
- Tempo: adjustable BPM dial for the sequencer (range 40–240).

## Layout

- Single page, everything visible at once — no separate record/edit/play screens.
- Recording area, sample library (arsenal) shelf, pad/sample grid, dials, and sequencer all on one screen. The library shelf can be a compact strip/list (name + quick-assign) rather than full detail — it just needs to make "pick from arsenal" possible without leaving the page.

## Data Model

Illustrative shape — the actual types will live in code, but this is the structure the reducer, engine, and UI are all built against:

```ts
type EffectId = 'pitch' | 'speed' | 'filter'; // extensible — more effect types can be added later

interface EffectSetting {
  id: EffectId;
  value: number; // 0–100 dial value, mapped internally to the real audio param
}

interface Sample {
  id: string;
  label: string;
  buffer: AudioBuffer;
  recordedAt: number;
}

interface Pad {
  id: string;
  sampleId: string | null;   // reference into the library, not ownership
  loop: boolean;
  color: string;             // assigned at pad creation, stable identity
  icon: string;
  effects: EffectSetting[];  // ordered list, not fixed fields
}

interface Pattern {
  id: string;
  name: string;
  steps: Record<string /* padId */, boolean[]>; // 16-length boolean arrays
}

interface Transport {
  bpm: number;                          // 40–240
  isPlaying: boolean;
  loopMode: 'once' | 'continuous';
  currentStep: number;
}

interface AppState {
  samples: Record<string, Sample>;   // the arsenal
  pads: Pad[];                       // every pad slot that has ever existed — never truncated
  visiblePadCount: number;           // how many pads (from the front of `pads`) are shown/triggerable
  patterns: Pattern[];               // only one is used/exposed today
  activePatternId: string;
  transport: Transport;
}
```

`pads.length` and `visiblePadCount` are deliberately separate: shrinking the pad count only lowers `visiblePadCount` (display-only), while `pads` itself only ever grows — this is what makes "shrink retains hidden data" representable without a separate archive structure.

## Saving

- None needed. Session-only, resets on reload. This is for messing around, not producing/exporting finished tracks.

## Platform

- Runs in browser. "PWA" in name only for now — no offline support or installability required.

## Tech Stack

- React + TypeScript (strict) + Web Audio API
- Vite for build tooling
- Centralized reducer (`useReducer` + context) for app state — no external state library
- ESLint + Prettier

## Infrastructure & Logic Notes

- **Audio engine**: a standalone module owning one `AudioContext`. Each library sample is decoded once into an `AudioBuffer` (`MediaRecorder` → `decodeAudioData`); pads trigger playback by looking up their referenced sample and building a fresh `AudioBufferSourceNode` → effect chain → destination at trigger time.
- **Dials**: 0–100% sliders per pad, mapped internally to audio params as described above (detune for pitch, playbackRate for speed, filter frequency for filter).
- **Scheduler — lookahead pattern, not naive `setInterval`.** A naive `setInterval` that fires audio directly drifts and jitters against the main thread (GC pauses, re-renders). Instead: a `setTimeout`-based polling loop runs frequently (e.g. every 25ms) and, on each poll, schedules any step events that fall within a short lookahead window (e.g. next 100ms) against `AudioContext.currentTime` — the actual sound-triggering is scheduled on the audio clock, not fired synchronously from the timer. BPM changes just change the interval math; nothing else about the pattern changes.
- **No persistence**: state lives in memory only, resets on page reload.

## Build Steps

- [ ] Set up Vite + React + TypeScript project (strict mode), ESLint + Prettier, Vitest
- [ ] Define core data model types (`Sample`, `Pad`, `Pattern`, `Transport`, `AppState`) and the reducer + actions
- [ ] Build the audio engine module (AudioContext lifecycle, sample decode, trigger/stop/choke API) — no UI yet, covered by Vitest
- [ ] Build the lookahead scheduler inside the engine, unit-tested against BPM→interval math independent of real audio
- [ ] Build basic layout: recording area, library shelf, pad grid, sequencer grid, dial areas (single page)
- [ ] Implement mic recording (`MediaRecorder`), decode to `AudioBuffer`, add to library on stop
- [ ] Wire library samples to pads (assign/reassign by reference, not copy)
- [ ] Implement pad click/tap to play its sound via the engine; wire loop-toggle and free-layering retrigger behavior
- [ ] Add per-pad dials (pitch/speed/filter) as 0–100% sliders, wired to audio params through the engine
- [ ] Build 16-step sequencer grid per pad (toggle steps on/off) against the `Pattern` model
- [ ] Wire sequencer playback to the engine's scheduler
- [ ] Add adjustable BPM dial, wire to scheduler timing
- [ ] Add adjustable pad count control (default 8), confirm shrink/grow preserves hidden pad data as designed
- [ ] Polish/test: loop stability, no audio glitches, retrigger layering behaves, works across pads
- [ ] (Optional, later) Save/export if you change your mind

## Sound Sampling

- Mic input captured via `MediaRecorder` API, converted to an `AudioBuffer` and stored in the library, not directly on a pad.
- A pad holds a reference (`sampleId`) to one library entry; reassigning a pad changes the reference only — the library entry persists and can be reused by other pads.
- No trimming/editing UI planned — snippet is used as recorded (can add later if needed).
- Playback rate, pitch (detune), and filter effects applied via Web Audio nodes at trigger time, not baked into the buffer — so the same library sample can sound different on different pads.

## Testing

- Manual testing for UI/interaction (pad clicks, dial drags, layout).
- Automated tests (Vitest) for logic that doesn't need a DOM or real audio hardware:
  - Reducer/action behavior (assigning samples, toggling steps, changing pad count).
  - Dial-value-to-audio-param mapping (0–100 → detune cents, playbackRate, filter frequency).
  - Scheduler timing: BPM-to-interval math, lookahead window scheduling, step advance — using a fake/mock clock rather than a real `AudioContext`, since the engine module is decoupled from the DOM by design.

## Deployment

- Hosted online via Vercel or Netlify (either works well with Vite + React, free tier is enough).
- Static build (`vite build`), no backend/server needed since there's no persistence.
- HTTPS required for mic access in the browser — both platforms provide this by default.

## Usage Flow (UI Details)

### Step 1 — Opening the app

- Pads show a clear empty/filled state (icon changes once a pad has a sample assigned).
- One global record button — hit record, then you're prompted to assign the new snippet to a pad; either way it lands in the library.

### Step 2 — Recording a sound

- No max length, stop whenever you tap stop.
- Live waveform/level display while recording for visual feedback.

### Step 3 — Assigning to a pad

- After recording stops, you're prompted to choose which pad to assign the snippet to (or skip and leave it in the library for later).
- If the chosen pad already has a sample assigned, you're asked to confirm before its reference is replaced — the old sample isn't deleted, just unassigned from that pad.

### Step 4 — Testing a pad / dials

- Each dial is a slider with its % value shown alongside.
- Per-pad reset button to snap all dials back to neutral (50%, no change) in one click.

### Step 5 — Building a rhythm

- Active steps show the pad's own color/icon (each pad gets a distinct color/icon when created, for quick visual ID — stable per pad regardless of which sample it currently references).
- Moving playhead highlights the current step across all rows as the sequencer plays.

### Step 6 — Repeating for other pads

- Repeat steps 2–5 (record, assign, dial in effects, set pattern) for each additional pad — or skip recording and assign an existing library sample directly.

### Step 7 — Setting the tempo

- BPM dial range: 40–240.
- Numeric BPM value shown next to the dial.

### Step 8 — Playing the sequence

- Single play/pause toggle button.
- A separate toggle to choose "loop continuously" vs "play once then stop."

### Step 9 — Tweaking live

- Dial and step changes apply instantly, even mid-loop (no waiting for the next beat).

### Step 10 — Resetting

- Browser warns before reload/close if there's in-progress work.
- Explicit "Clear All" button in-app for when you actually want a blank slate, instead of relying on reload.

## Open Questions (deferred, not blocking)

- How much library-shelf UI to build in v1 (a simple assign-from-list vs. a fuller browsable arsenal with search/rename/delete) — left to grow naturally rather than decided upfront, per the project's own philosophy.
- Cross-browser `MediaRecorder` quirks (Safari/iOS codec support) — not a concern unless this ends up used outside one browser.

## Notes

- Personal/casual project, not a portfolio piece — favor quick, fun iteration over polish in the *feature* set. The architecture itself, however, is built deliberately solid so growth doesn't require re-founding it later.
