# Beat Maker App — Project Idea

## Summary

A phone-first web app that lets you record sound snippets from your mic, build up a library ("arsenal") of them, and turn them into a beat using dial-based controls. Casual, personal-use project — no saving/export needed, no offline requirement. Scope is expected to grow organically over time, so the foundation is built solid even though the current feature set is small.

Originally built as one continuously-scrolling page; restructured into a small multi-page app shell once real use showed the dials and the sequencer needed to not compete for screen space with the pad grid or each other. See **Layout** below.

## Architecture Foundations

These are load-bearing decisions made deliberately so the base doesn't need to be re-poured as features get added later.

- **Language: TypeScript, strict mode.** The pad/sample/pattern/effect shapes are the contract between the audio engine and the UI — TypeScript keeps that contract enforced as both sides grow.
- **Audio engine: a decoupled module, not hooks.** All `AudioContext`, node graph, and scheduler logic lives in a plain TS class/module with no React dependency. React components call its methods and subscribe to its state; they never touch `AudioContext` directly. This means:
  - Audio timing is never at the mercy of a React re-render.
  - The scheduler can be unit-tested in Vitest with zero DOM.
  - The engine can be swapped, extended, or driven from something other than this UI later without a rewrite.
- **State: centralized reducer, not scattered `useState`.** One typed app-state shape (samples, pads, patterns, transport) updated through a reducer via `useReducer` + context. Still "plain React state" as originally scoped — just organized so state changes are traceable actions instead of ad hoc setters spread across components.
- **Data model: headroom built in now.** Effects are modeled as an ordered list per pad, not a fixed set of hardcoded fields. Patterns are modeled as a collection, not a single hardcoded grid. The UI today only exposes one pattern and six effects (pitch/speed/filter/volume/grit/echo, grown from an initial three) — but adding a second pattern or another effect later is adding data, not restructuring core state. See **Data Model** below for the concrete shapes.
- **Tooling defaults** (not asked about, applying as sensible defaults for a "don't build flimsy" project): ESLint + Prettier from the start, Vitest for the engine/reducer/scheduler logic, strict `tsconfig`.

## Core Features

### Recording & the Sample Library ("Arsenal")

- Record multiple sound snippets from the device mic.
- Every recording lands in a persistent (session-lifetime) **sample library** — a growing arsenal of snippets, independent of pads.
- After recording stops, you're prompted to assign the new snippet to a pad — but the snippet also stays in the library regardless, so it can be reassigned or reused later.
- **The review popup loops the fresh take back immediately by default** (a bare, effects-free preview — see `AudioEngine.previewLoop`), with a pause/play toggle next to its waveform. Hearing it on repeat is how you actually judge a take, rather than having to assign it to a pad first just to press play.
- Pads **reference** a library sample by ID; they don't own the audio data. Reassigning a pad to a different library sample doesn't delete the old sample — it just changes what that pad points to.
- Also support looping/layering a single snippet on its own.
- Pads triggered by click/tap (no keyboard shortcuts).
- Pad count: adjustable, default 9 (fills the 3-column pad grid to a clean 3×3, no partial row).
- **Every sample carries a `kind`** — `'recording'` (a plain mic take), `'note'` (one key of a built Instrument), or `'sequence'` (a bounced multi-hit playthrough recording, see Playthrough recording below) — derived from how the sample was made, not from analyzing its audio content (unreliable for a lightweight app). Drives the Library's at-a-glance type badge.

### Instruments

- Lives in the Library, above the raw sample list — a place to build a **16-key keyboard** from either a bundled synth preset or one of your own recordings, then lay it across the pads in one tap.
- **Bundled presets**: Piano, Bass, Lead — simple oscillator-plus-envelope synth patches (triangle/sine/sawtooth with an ADSR-ish envelope, no audio assets), not attempting to sound like a real instrument, just distinct enough starting points. Rendered offline (via `OfflineAudioContext`, no live `AudioContext` needed) at 16 ascending semitones from a root frequency.
- **From a recording**: pick any existing library sample as the root note; the app pitch-maps it across the same 16-key range by baking a `detune`d offline render into a new buffer per key — the same mechanism the live pitch dial already uses, just rendered once instead of applied at playback time. The picker excludes samples that are themselves already-generated instrument keys, so you can't accidentally build an instrument out of a synthesized note.
- **Every key is a real library Sample** — no separate instrument-playback path. This means an instrument's keys get full trim/effects/loop/mute once on a pad, exactly like any recording.
- Deleting an instrument removes its generated key samples from the library too (unassigning any pad using one), so building a few instruments to try out doesn't leave a trail of orphaned samples behind.
- Laying an instrument across the pads is **Instrument Mode**, a pad-grid setting (see Pad Playback Behavior below), not a Library action — building an instrument and applying it are two separate steps in two separate places.

### Playthrough recording

- A **Playthrough** toggle (its own small FAB, independent of the pad-grid mode — see Layout) changes what holding the record FAB captures: off (default), it records from the microphone as always; on, it captures a live mix of whatever the app is actually playing during the hold — every currently-looping pad plus every manual tap/gate, mixed exactly as heard — instead.
- **Not mutually exclusive with loop mode or instrument mode.** The whole point is recording a playthrough of loops you've already started running, or of an instrument you're playing live by hand — those are pad-grid concerns, this is a recording-source concern, and the two axes are independent.
- **Implementation**: every playback node connects to a shared master bus (`AudioEngine.getMasterBus`) instead of `ctx.destination` directly; starting a playthrough recording taps that bus with a `MediaStreamAudioDestinationNode` and records the resulting stream with `MediaRecorder` — the same mechanism `useRecorder.ts` already uses for the microphone, just fed a synthetic Web Audio stream instead of `getUserMedia`, so it needs no microphone permission at all. The metronome click and a recording's own preview-loop (see above) deliberately bypass the master bus, connecting straight to `ctx.destination`, so neither one ever bleeds into a playthrough capture.
- Bounced samples land in the library tagged `kind: 'sequence'`, reviewed through the exact same popup a mic recording uses.
- This replaced an earlier, narrower mechanism (Instrument Mode specifically triggering an offline re-render of logged pad-press events) — the live master-bus tap is strictly more general: it works regardless of which pad-grid mode is active, and captures sustained loops, which the discrete-hit approach couldn't.

### Pad Playback Behavior

- **Three mutually-exclusive global modes govern the pad grid — loop mode, instrument mode, and mixer mode, all off by default.** Turning one on turns the others off (enforced in the reducer): each changes what interacting with a pad means for the grid as a whole, so having more than one on at once would be ambiguous. Loop Mode has its own always-visible switch (top-right of the Pads panel, see Layout); Instrument Mode and Mixer Mode share the grid-mode FAB's menu.
  - **Loop mode off** (the baseline, regardless of the other modes): a pad always plays — a quick tap plays the sample through in full, holding past ~200ms gates it (the sound follows your finger, stopping the instant you release). A quick tap's behavior is unchanged from before gating existed; gating only kicks in on a deliberate hold.
  - **Loop mode on**: tapping a pad toggles its loop on or off directly instead of playing a one-shot; gating doesn't apply there, since a loop toggle is discrete. Multiple pads loop together freely (see Sync below). This replaced an even earlier design where a pad had its own dedicated Loop button in the action bar.
  - **Instrument mode on**: picking it from the grid-mode menu always prompts "choose an instrument" first — there's no implicit "whatever was there before." Picking one lays its keys across the visible pads (confirmed first if any pad already has a sound). Pads keep playing exactly like the loop-off baseline (tap/gate) — the point is playing the instrument by hand, not a new pad-tap behavior — but every pad holding one of an instrument's keys shows a small badge with that key's number (1-based, low to high) so it's visually obvious the grid is an ordered keyboard right now, independent of whether the mode toggle itself is on. Recording while playing an instrument works the same way as recording anything else — see Playthrough recording above if you want the performance captured as a single new sample.
  - **Mixer mode on**: pads stop being tap targets entirely and become vertical fader sliders — dragging (or just tapping a spot) sets that pad's `mixLevel` from the vertical position within the tile (top = 100/unity, bottom = 0/silent), shown as a colored fill plus a percentage readout. Nothing plays from touching a fader; it's a mixing surface, meant to be used while a pattern or loops are already playing. `mixLevel` is deliberately a separate value from the Volume effect dial (see Dials/Controls) — a quick, always-in-reach "how loud does this sit in the mix" control, not a character/boost dial you set once while editing a sound. Dragging a fader on a currently-looping pad updates its actual output live, the same "dial changes are audible immediately" behavior every other pad dial has.
- **Loop sync**: starting a new loop while at least one pad is already looping doesn't cut in immediately — it's quantized to the next bar boundary (one measure at the current BPM) so layered loops stay in phase with each other, the same way a DAW's quantized launch works. The very first loop in a group always starts immediately and becomes that group's beat reference; once every loop stops, the next one to start resets the reference. `isPadLooping` (and so the pad's "looping" visual) goes true as soon as a loop is scheduled, even if its audible start is still up to a bar away.
- **Retriggering a one-shot pad**: layers freely — each tap fires a new overlapping playback instance, standard sampler behavior. This is also what naturally happens when a manual tap coincides with a sequencer step firing the same pad; no special-casing needed.
- **Shrinking pad count**: purely a display/trigger-surface control. Data for pads above the new count is retained in state, not deleted, and reappears if the count is grown back. (No confirmation dialog needed since nothing is actually discarded — this only applies to pad *slots*; explicitly deleting a sample from the library or clearing a pad is a separate, deliberate action.)
- **Mute**: independent of loop and of having a sample assigned — a muted pad produces no sound at all, from a manual tap or a sequencer step, without losing its sample assignment or its programmed steps. Visually dimmed so it's clear why tapping it does nothing. Distinct from "empty" (no sample) and from clearing a pad's data.
- **Effects bypass**: a reversible per-pad toggle (Pads-page action bar, directly below Mute) that plays the pad as if every effect dial were neutral, without touching the stored dial values — turning it back off restores exactly what was dialed in. Distinct from the Edit page's "Reset dials," which actually zeroes the values; bypass is non-destructive and just changes what's audible right now, live on a currently-looping pad too.

## Dials / Controls

- Audio effect dials: volume, speed, pitch, filter, grit, echo — six, per-pad (each pad has its own settings, independent of which library sample it currently references). Ordered on the edit page by how often each gets reached for in practice, most to least: Volume (adjusted on nearly every pad), Speed/Pitch (the classic sample-flipping moves), Filter (a common tone-shaping tweak), then Grit/Echo (occasional character effects) last.
  - **Range is bipolar: -100 (full one way) .. 0 (neutral, no change) .. +100 (full the other way)**, not 0–100 with 50 as an implicit midpoint — "50%" reads as "half speed," which is misleading when 50 actually meant neutral. 0 always means "no change" now. Dials snap to 25-point anchors (-100, -75, -50, ... 100), so a drag to 76 lands on 75.
  - **Speed → `AudioBufferSourceNode.playbackRate`.** -100 = 0.5x, 0 = 1x (unchanged), +100 = 2x.
  - **Pitch → `AudioBufferSourceNode.detune`.** Plain `playbackRate` changes pitch and speed together (it's just resampling) — using `detune` for pitch keeps the two dials genuinely independent without needing a phase vocoder or other heavy DSP. -1200..+1200 cents (one octave either way), 0 at dial 0. This only works within `detune`'s practical range; that's an accepted limitation, not a bug.
  - **Filter → a bipolar tone control**, not a one-directional sweep: negative values progressively muffle (lowpass, cutoff dropping as the dial goes further negative), positive values progressively thin the sound out (highpass, cutoff rising), 0 is neutral (`allpass`, negligible audible effect — kept in the graph rather than removed, so the node topology never changes while a pad loops). A single `BiquadFilterNode` whose `type` and `frequency` both change with the dial.
  - **Volume → a `GainNode`.** -100 = silent, 0 = unity (unchanged), +100 = a 2x boost that can drive the signal into clipping if pushed hard — an accepted, occasionally desirable side effect, not a bug. Per-pad, so one pad can sit quieter in the mix than another without touching the shared sample it references.
  - **Grit → a `WaveShaperNode`**, a character dial rather than a one-directional "amount of distortion" knob: negative crushes the sound into a harsh, quantized, digital lo-fi texture (fewer effective bit-depth steps the further negative), positive drives it into warmer, analog-style soft-clip saturation (a `tanh` curve, more aggressive with distance from 0), 0 is clean/untouched (identity curve, node kept in the graph either way — same "never rewire the topology" reasoning as Filter's allpass).
  - **Echo → a `DelayNode` + feedback loop**, one effect with two textures rather than a plain wet/dry knob: negative is a tight, quick slapback (a short delay, closer to doubling than a distinct repeat), positive is a longer, spacier delay with more audible repeats, 0 is fully dry. Delay/feedback/wet-mix nodes are always wired into the graph (at 0 gain when the dial is neutral) so turning it on mid-loop needs no graph surgery — same pattern as Filter and Grit.
  - **Changes apply live to a pad that's currently looping** — dragging a dial audibly updates the sustained sound in real time (via `AudioParam.setTargetAtTime` for a click-free ramp on every dial except Grit, whose `WaveShaperNode.curve` isn't an `AudioParam` and so snaps rather than ramps — an accepted, minor departure since grit reads as a character jump anyway, not a continuous sweep), not just the next trigger. One-shot instances already in flight aren't retroactively editable (there's no single "the" instance once several are layered).
- Rhythm dials: beat pattern / step sequencer controls, 16-step grid.
- Tempo: adjustable BPM dial for the sequencer (range 40–240).
- **Metronome**: an optional synthesized click (no sample/asset — a short oscillator blip) on quarter-note beats, accented on the pattern's downbeat. **Fully independent of the play/pause button** — its own toggle starts and stops it directly, whether or not the sequencer is playing; it shares the same lookahead clock as the sequencer so the two stay phase-locked whenever both happen to be on, but pressing Play never starts or stops it and pressing the metronome button never starts or stops sequencer playback. Pressing Play always (re)starts the pattern at step 1, resyncing the metronome's click to that downbeat as a side effect if it was already ticking on its own. Its toggle button lives beside the record FAB (not in the play bar) — both are global utilities reachable from anywhere and independent of transport state, so they're grouped together rather than with the sequencer-specific play/pause/loop-mode controls.
- Every slider in the app earns its place as a slider (BPM, the six dials) — continuous ranges where fine control matters. Discrete, coarse, rarely-adjusted settings (pad count) use a stepper (−/+ buttons) instead, since a slider is the wrong control for "occasionally nudge an integer between 1 and 16."
- Every dial (and the trim control) has a tap-to-open info icon explaining what it does — tap, not hover, since hover doesn't exist on the phone this app targets.

## Layout

A small app shell — persistent global chrome around three pages, no router library (a plain page/navigation React context is enough for three flat destinations with no need for URLs or browser history):

- **Scroll architecture**: the top nav, bottom PlayBar, and FAB cluster are all `position: fixed` chrome; `.app-shell` (the actual page content) is pinned between them — `top`/`bottom` set to the nav/FAB bands' exact reserved heights — and scrolls *within itself* (`overflow-y: auto`), rather than the whole document scrolling underneath fixed overlays. An earlier version reserved bottom clearance as extra padding at the end of a normally-scrolling document; that only actually cleared the floating FABs once you'd scrolled all the way to a page's true end, which for a page whose content is roughly one screen tall (the Pads page's 3×3 grid, for instance) never visibly happens — the reserved padding sits below the fold, unseen, while real content still renders directly under the FABs at the default scroll position. Bounding `.app-shell` itself makes that class of overlap structurally impossible: content can never render outside the box's own edges, however tall it is or wherever it's scrolled to.
- **Every popup portals to `document.body`** (a shared `<Overlay>` component wrapping `createPortal`), not just renders in place — a consequence of `.app-shell` being `position: fixed`, which per spec makes it its own stacking context. A popup opened from a button *inside* a page component (which is most of them) would otherwise be a DOM descendant of `.app-shell`, trapping its z-index comparisons inside that context — meaning it could end up visually and interactively *underneath* a fixed sibling of `.app-shell` (the FAB cluster, the Sequencer's PlayBar) despite the popup's own z-index being far higher, since z-index only competes within the nearest stacking context, not across one. Found via the Sequencer's per-row library-swap popup: its Cancel button, sitting at the same screen position as the PlayBar's BPM slider, was silently unclickable — Playwright's "element intercepts pointer events" caught it immediately, a real browser reproducing exactly what a person's finger would hit. Portaling every popup to `document.body` sidesteps the whole class of bug rather than special-casing each affected spot.
- **Top nav** (fixed): three page tabs — **Pads** (home), **Sequencer**, **Library** — plus two utility actions reachable from anywhere: a panic **"stop all sounds"** button (silences every loop, every in-flight one-shot, and pauses the sequencer, all at once) and a **settings** gear (pad count, project Save/Load, Clear All — opens as an overlay, tucked away since it's touched rarely).
- **Bottom PlayBar — Sequencer page only, not global chrome**: play/pause, BPM, loop-once-vs-continuous. These are all specifically about sequencer pattern playback and meaningless while just tapping/looping pads by hand, so the bar only exists on the Sequencer page rather than floating over every page reserving space for controls that don't apply there. Playback keeps running in the background if you navigate away — pausing just means coming back to Sequencer, an accepted trade-off for reclaiming that space everywhere else. The metronome used to live here too but moved out — see the record FAB bullet below — since it's independent of play/pause and belongs with the app's other page-agnostic utilities, not the sequencer transport.
- **Floating record + metronome + playthrough + grid-mode cluster** (fixed, global on every page except while the pad edit popup is open, bottom-right): press-and-hold the record button to record — the hold itself *is* the recording gesture, release stops it, however long that was. Recording was never tied to one screen or page; a name/waveform-preview/assign-or-discard review appears as a modal overlay regardless of where you started recording from, so it's never blocked by which page happens to be open. A metronome toggle and a smaller **Playthrough** toggle (see Playthrough recording above) sit beside it, and a single **grid-mode button** (its icon reflects the current mode) opens a small menu to switch between Off, Instrument Mode, and Mixer Mode. Loop Mode used to be a third menu option here too, but got its own dedicated switch on the Pads panel instead (see below) — reached for often enough that a two-tap "open menu, then pick Loop Mode" was more friction than it deserved; the FAB's own icon still shows the loop glyph when Loop Mode is active (via the switch), even though it's no longer selectable from this menu, so it's clear at a glance why Instrument/Mixer aren't available right now. Picking Instrument Mode from the menu flows straight into the existing "choose an instrument" picker. The grid-mode button is the one hidden while the pad edit popup is open: that popup has its own pad-specific loop button (see below), so the global one would sit right next to it doing something confusingly different. Metronome, Playthrough, and Record all stay visible there regardless.
- **Pads page (home)**: the pad grid is the hero content, full width, nothing sharing space with it, laid out 3-per-row so each pad is a generous ~100×100px tap target (default pad count 9 fills this to a clean 3×3). The panel header carries the **Loop Mode switch** top-right, next to the "Pads (N)" heading — a real switch look (a track with a sliding thumb, not just a colored button) with a loop glyph, since a mode this central deserved a single, always-visible tap rather than a menu detour. An empty pad shows a faint tint of its own color (not a hollow outline) and a "+" hint rather than the word "empty" — reads as an invitation to tap, not just a status label. A filled pad shows a faint waveform silhouette behind its number (from the same peaks data the Library's thumbnails use) — a quick "which sound is this" visual cue, low-opacity so it never competes with the number/badge on top of it. The pad itself is a single undivided tap-to-play/tap-to-loop zone (see Pad Playback Behavior above) showing only live "playing"/"looping"/"muted" visual feedback and, while it holds an instrument key, a small numbered badge (that key's 1-based position, low to high) — showing the actual key number, not a repeated generic icon, is what makes the grid read as an ordered keyboard once an instrument is applied. In Mixer Mode, pads render as `MixerPadFader` tiles instead (a colored fill plus a percentage) — see Pad Playback Behavior above. Tapping a pad selects it and surfaces a summary bar below the grid with four full-sized actions in a plain 2×2 grid, in reading order: **Mute**, **Effects**, **Edit**, **Library**. Mute and Effects — the most-reached-for actions — carry an accent outline even at rest; Edit and Library are quieter, plain-bordered navigational actions, a deliberate flip from an earlier version where Edit/Library were the colored ones and the two most-used buttons were the plainest. Library opens a popup listing every library sample so you can drop one straight onto the selected pad — the reverse direction of the Library page's own "Assign…" action, which starts from a sample and asks which pad. Moving these off the pad face and into generously-sized buttons fixed a real touch-precision problem: a small icon crowded into the corner of an already-small tile was hard to hit reliably.
- **Pad edit popup** (opened via "Edit," a modal overlay over whatever page you were on — not a navigated-to page, and not a nav tab): the per-pad dials (volume/speed/pitch/filter/grit/echo, most-used first, with a row of quick-start presets across filter/grit/echo above them) and the trim editor share the popup sheet. The header shows live playing/looping status tags on the left, the "Pad N" heading centered, and a close (✕) button on the right. Below the header, a horizontally-scrollable strip of every pad (a small swatch each, current one highlighted, a pulsing dot on any that's looping) lets you flip between pads without leaving the editor, paired with one full-sized Loop button that always acts on whichever pad the strip currently has selected. Dismissing it — tapping the backdrop or the close button — is instant and unconfirmed: every dial/trim change here dispatches immediately, so there's nothing "unsaved" a popup dismissal could lose (this replaced an earlier full-page version with an edge-swipe-to-go-back gesture and a leave confirmation, both made unnecessary once it became a popup with nothing to protect).
- **Sequencer page**: the 16-step grid gets its own page, meant to be visited once the pads are filled in and it's time to assemble a pattern — not something you're nudging past while trying to do something else. Restyled to read as a continuous timeline rather than an isolated checkbox grid: steps within a beat sit close together, each 4-step beat group is set off from the next by a real bar-line border (not just a background tint), and the currently-playing step glows instead of just outlining. Each row shows a small pulsing badge (and a ring around its pad-number circle) whenever that pad is independently looping via the pad-page loop button, so the sequencer's own step pattern is never mistaken for — or silently coexisting unnoticed with — a separate loop already playing. **Tapping a row's color swatch opens the same library picker the Pads page uses**, so you can swap what a row plays without leaving the Sequencer — the reverse-assign flow reused a second time. **"+ Add row"** below the grid grows `visiblePadCount` by one, the same mechanism Settings' pad-count stepper already used. **"Bounce to Pad"** sits beside it — renders the pattern exactly as programmed (mute/trim/effects/mix-level respected, disabled when nothing's been stepped in) down to a single new sample via an offline `OfflineAudioContext` render, reviewed through the same popup a recording uses — completing the pad → beat → sequence → pad loop the whole app is built around. The PlayBar (play/pause, BPM, loop-mode) appears whenever the Sequencer is visible — on a narrow screen that's only the Sequencer page itself; on a wide screen (see Wide-screen layout below) it's also visible while the Pads tab is selected, since the Sequencer is showing alongside it there too.
- **Wide-screen layout** (≥900px, `useIsWideScreen`, a `matchMedia` hook): Pads and Sequencer — the two screens you actually go back and forth between while building a beat — show side by side in a `.wide-split` grid instead of as separate pages; the nav tabs still work, switching to either one reveals both. Library stays a full-width page even when wide, since it's more of an occasional-visit browsing screen than something you'd want pinned next to the pads. `.app-shell`'s own max-width grows to make room for both columns.
- **Library page**: instruments (build from a preset or a recording, delete) sit above the sample library — both get their own page, tucked out of the way of the pads, for occasional housekeeping rather than competing with the main pad-focused screen. Applying an instrument to the grid lives on the Pads page instead (Instrument Mode), not here. The sample library itself is a **grid of cards**, not a list (`repeat(auto-fill, minmax(150px, 1fr))`) — each card leads with a large waveform (recognizing a sound by its shape is faster than reading its name) above a row of at-a-glance facts: a kind badge (🎤 Recording / 🎹 Note / 🥁 Sequence — see `Sample.kind`), duration, and a simple loudness descriptor (Quiet/Medium/Loud, thresholded off the sample's own peak amplitude — no new audio analysis). Rename, reorder, Assign…, and Delete all still work the same as before, just inside a card instead of a row.

## Data Model

Illustrative shape — the actual types will live in code, but this is the structure the reducer, engine, and UI are all built against:

```ts
type EffectId = 'pitch' | 'speed' | 'filter' | 'volume' | 'grit' | 'echo'; // extensible — more effect types can be added later

interface EffectSetting {
  id: EffectId;
  value: number; // -100..100, 0 = neutral/no change, mapped internally to the real audio param
}

type SampleKind = 'recording' | 'note' | 'sequence'; // how it was made, not audio-analyzed — see Recording & the Sample Library

interface Sample {
  id: string;
  label: string;
  buffer: AudioBuffer;
  recordedAt: number;
  kind: SampleKind;
  peaks: number[];            // precomputed waveform thumbnail (0-1 amplitudes)
}

interface Pad {
  id: string;
  sampleId: string | null;   // reference into the library, not ownership
  // No `loop: boolean` here — whether a pad is looping is live engine state
  // (AudioEngine.isPadLooping), not a persisted mode. Tapping the pad body
  // always plays a one-shot; the loop button starts/stops an actual loop.
  muted: boolean;            // silences taps and sequencer steps alike, independent of sample
  effectsBypassed: boolean;  // reversible: plays as if every effect were neutral, values untouched
  color: string;             // assigned at pad creation, stable identity
  icon: string;
  effects: EffectSetting[];  // ordered list, not fixed fields
  trimStart: number;         // 0-1, non-destructive playback window into the sample
  trimEnd: number;           // resets to (0, 1) whenever a different sample is assigned
  mixLevel: number;          // 0-100, a plain fader (not bipolar) — Mixer Mode's control, separate from the Volume effect dial
}

interface Instrument {
  id: string;
  name: string;
  source: 'preset' | 'recording';
  keySampleIds: string[];    // 16 keys, ascending semitones from the root; each is a real Sample id
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
  metronomeEnabled: boolean;
  padLoopModeEnabled: boolean;          // global: tapping a pad toggles its loop instead of playing it
  padInstrumentModeEnabled: boolean;    // global: mutually exclusive with padLoopModeEnabled and padMixerModeEnabled
  padMixerModeEnabled: boolean;         // global: pads become drag-to-set volume faders; mutually exclusive with the other two grid modes
  playthroughRecordingEnabled: boolean; // global: NOT mutually exclusive with the grid modes above — see Playthrough recording
}

interface AppState {
  samples: Record<string, Sample>;   // the arsenal, keyed by id — includes instrument-generated keys
  sampleOrder: string[];             // display/edit order for the library
  instruments: Record<string, Instrument>;
  instrumentOrder: string[];         // display order for the library's instrument list
  pads: Pad[];                       // every pad slot that has ever existed — never truncated
  visiblePadCount: number;           // how many pads (from the front of `pads`) are shown/triggerable
  patterns: Pattern[];               // only one is used/exposed today
  activePatternId: string;
  transport: Transport;
}
```

`pads.length` and `visiblePadCount` are deliberately separate: shrinking the pad count only lowers `visiblePadCount` (display-only), while `pads` itself only ever grows — this is what makes "shrink retains hidden data" representable without a separate archive structure.

## Saving

Reversed from the original "session-only, no persistence" decision once real use showed losing work on every reload was actually a problem worth solving.

- **Autosave to the browser (IndexedDB)**: every change — a new recording, a dial tweak, a step toggle — is written back automatically, debounced (~1.2s after the last change) so a dragged dial doesn't hammer the database on every tick. Reload picks up right where you left off, no action needed. Tied to one browser on one device; clearing site data or switching browsers loses it, same as any browser-storage-based persistence.
- **Explicit export/import as a project file**: a "Save" button in Settings downloads a self-contained JSON file (`beat-maker-<timestamp>.json`) with every sample's audio embedded as base64-encoded WAV, plus pads/patterns/transport. A "Load" button reads one back in (with a confirm step, since it replaces the current session) — portable across browsers and devices, and safe from autosave getting cleared. This is the deliberate backup/sharing mechanism; autosave is the "just don't lose my work" safety net.
- **Format**: one JSON object, `version: 1`, samples embedded inline as WAV rather than a separate zip/multi-file bundle — keeps the whole project in one file with no extra library (no ZIP dependency) and no separate-file-management UX. `AudioContext.decodeAudioData` reads WAV natively, so loading a sample back in reuses the exact same decode path recording already uses — no new audio-decode code needed.
- Transient playback state (is it currently playing, which step the sequencer is on) is deliberately excluded from both the autosave record and the exported file — only project *data* is saved, not moment-to-moment playback state, so loading a project always starts paused at step 0 rather than resuming mid-playback.

## Platform

- Runs in browser. "PWA" in name only for now — no offline support or installability required.

## Tech Stack

- React + TypeScript (strict) + Web Audio API
- Vite for build tooling
- Centralized reducer (`useReducer` + context) for app state — no external state library
- ESLint + Prettier

## Infrastructure & Logic Notes

- **Audio engine**: a standalone module owning one `AudioContext`. Each library sample is decoded once into an `AudioBuffer` (`MediaRecorder` → `decodeAudioData`); pads trigger playback by looking up their referenced sample and building a fresh `AudioBufferSourceNode` → effect chain → destination at trigger time.
- **Dials**: bipolar -100..100 sliders per pad, mapped internally to audio params as described above (detune for pitch, playbackRate for speed, filter frequency for filter, gain for volume, a WaveShaper curve for grit, delay/feedback/wet for echo).
- **Scheduler — lookahead pattern, not naive `setInterval`.** A naive `setInterval` that fires audio directly drifts and jitters against the main thread (GC pauses, re-renders). Instead: a `setTimeout`-based polling loop runs frequently (e.g. every 25ms) and, on each poll, schedules any step events that fall within a short lookahead window (e.g. next 100ms) against `AudioContext.currentTime` — the actual sound-triggering is scheduled on the audio clock, not fired synchronously from the timer. BPM changes just change the interval math; nothing else about the pattern changes.
- **Persistence**: autosaved to IndexedDB (debounced) plus explicit JSON-file export/import — see **Saving** above for the full design.

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
- **Trim, per pad, non-destructive.** Each pad has its own trim window (`trimStart`/`trimEnd`, as fractions 0-1 of the sample's duration) into whichever library sample it references — dragged directly on a waveform display. The underlying recording is never altered; trim is purely a playback window applied via `AudioBufferSourceNode`'s native `offset`/`duration` (one-shot) or `loopStart`/`loopEnd` (looping) parameters, not by slicing/copying buffer data. Because it's per-pad rather than per-sample, the same recording can be trimmed differently on different pads — chopping one longer take across multiple pads, the way a hardware sampler's "chop" feature works. Resets to the full sample whenever a different sample is (re)assigned to that pad, since an old trim window has no correct meaning on a new recording's waveform.
- Playback rate, pitch (detune), and filter effects applied via Web Audio nodes at trigger time, not baked into the buffer — so the same library sample can sound different on different pads.
- A recording is not added to the library until you decide to keep it — "Discard recording" clears it without ever touching app state, so a bad take never clutters the library, even momentarily. "Keep in library only" or assigning it to a pad both commit it.

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

- Lands on the Pads page. Pads show a clear empty/filled state (icon changes once a pad has a sample assigned).
- A floating record button, reachable from every page — recording was never meant to require being on a particular screen.

### Step 2 — Recording a sound

- Press and hold the record button to record; release to stop. No max length — however long you hold it. The hold gesture is the record/stop control; there's no separate start/stop tap to remember.
- Live waveform display while holding, for visual feedback.

### Step 3 — Reviewing, naming, and assigning (or discarding)

- After recording stops, you see a waveform preview and a name field, and you're prompted to choose which pad to assign it to (or "keep in library only," or discard it entirely).
- The recording isn't added to the library until you choose to keep it — discarding never touches the library, even briefly.
- If the chosen pad already has a sample assigned, you're asked to confirm before its reference is replaced — the old sample isn't deleted, just unassigned from that pad.

### Step 4 — Testing a pad / dials

- With loop mode off (the default), tapping a pad body plays it — a quick tap plays through in full, holding gates it (release stops the sound wherever it is). With loop mode on (its own toggle, next to record/metronome), tapping a pad starts or stops a continuous loop instead, in one tap each way — its on/off look always matches whether the pad is actually looping right now, and multiple pads loop together in sync.
- Tapping a pad surfaces an "Edit" action, opening a popup for dials/trim over whatever page you were on. That popup has its own pad-switcher strip and Loop button, so you can flip between pads and loop whichever one you land on without leaving the popup.
- Each dial is a slider (-100..100, snapping to 25-point anchors) with its signed value shown alongside — e.g. "+50", not "75%", so it's clear which direction and how far from neutral you are.
- A row of named presets above the dials sets Filter/Grit/Echo to a tasteful combo in one tap (e.g. "Telephone," "Underwater") — Pitch/Speed/Volume are left untouched.
- Drag the trim handles on the waveform to choose which part of the recording this pad plays — non-destructive, and independent per pad even when pads share a sample.
- A small tap-to-open info icon next to each dial and the trim control explains what it does.
- Per-pad reset button to snap all dials back to neutral (0, no change) in one click.

### Step 5 — Building a rhythm

- Once the pads are filled in, switch to the Sequencer page (its own dedicated screen, meant to be visited when it's time to assemble — not shared with anything else).
- Active steps show the pad's own color/icon (each pad gets a distinct color/icon when created, for quick visual ID — stable per pad regardless of which sample it currently references).
- Each row shows a small badge whenever that pad is independently looping (via its pad-page loop button), so the sequencer's programmed pattern is never confused with a separate loop already playing.
- Moving playhead highlights the current step across all rows as the sequencer plays.

### Step 6 — Repeating for other pads

- Repeat steps 2–4 (record, review/assign, dial in effects) for each additional pad — or skip recording and assign an existing library sample directly from the Library page. Recording works the same from any page, so this doesn't require navigating back to Pads first.

### Step 7 — Setting the tempo

- BPM dial range: 40–240.
- Numeric BPM value shown next to the dial.

### Step 8 — Playing the sequence

- Single play/pause toggle button.
- A separate toggle to choose "loop continuously" vs "play once then stop."

### Step 9 — Tweaking live

- Dial and step changes apply instantly, even mid-loop (no waiting for the next beat).

### Step 10 — Resetting and stopping

- No reload/close warning — autosave means a reload just picks the session back up, so there's nothing to lose and nothing to warn about.
- Explicit "Clear All" button in the settings overlay (gear icon in the top nav) for when you actually want a blank slate — clears the autosave record too, so the cleared state stays cleared on the next reload rather than autosave silently restoring what you just cleared.
- A dedicated "stop all sounds" button in the top nav — reachable from every page — panic-stops everything at once: every looping pad, every in-flight one-shot (including a long recording still playing out), and pauses the sequencer if it's running.

## Open Questions (deferred, not blocking)

- Library search (by name) is still open — rename/reorder/delete are in, search isn't yet needed at current library sizes.
- Cross-browser `MediaRecorder` quirks (Safari/iOS codec support) — not a concern unless this ends up used outside one browser.

## Notes

- Personal/casual project, not a portfolio piece — favor quick, fun iteration over polish in the *feature* set. The architecture itself, however, is built deliberately solid so growth doesn't require re-founding it later.
