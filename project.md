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
- **Data model: headroom built in now.** Effects are modeled as an ordered list per pad, not a fixed set of hardcoded fields. Patterns are modeled as a collection, not a single hardcoded grid. The UI today only exposes one pattern and eight effects (pitch/speed/filter/volume/pan/grit/echo/reverb, grown from an initial three) — but adding a second pattern or another effect later is adding data, not restructuring core state. See **Data Model** below for the concrete shapes.
- **Tooling defaults** (not asked about, applying as sensible defaults for a "don't build flimsy" project): ESLint + Prettier from the start, Vitest for the engine/reducer/scheduler logic, strict `tsconfig`.

## Core Features

### Recording & the Sample Library ("Arsenal")

- Record multiple sound snippets from the device mic.
- Every recording lands in a persistent (session-lifetime) **sample library** — a growing arsenal of snippets, independent of pads.
- After recording stops, you're prompted to assign the new snippet to a pad — but the snippet also stays in the library regardless, so it can be reassigned or reused later. Assigning it doesn't immediately close the review either — it hands you an explicit **"Edit this pad" vs "Done"** choice first, so jumping straight into that pad's trim/effects on what you just captured is one obvious tap away instead of a separate hunt-down-the-pad-and-tap-Edit trip after closing the popup.
- **The review popup loops the fresh take back immediately by default** (a bare, effects-free preview — see `AudioEngine.previewLoop`), with a pause/play toggle next to its waveform, for a plain mic recording (`kind: 'recording'`). Hearing it on repeat is how you actually judge a take, rather than having to assign it to a pad first just to press play. A `kind: 'sequence'` recording (a Bounce-to-Pad render or a Playthrough capture) does **not** auto-preview, though: unlike a mic take, it was very likely built from pads/loops that are still playing right now, and auto-looping it on top of that live mix the instant the popup opens would just be messy overlap — the play/pause button still works, it's just not pressed automatically.
- Pads **reference** a library sample by ID; they don't own the audio data. Reassigning a pad to a different library sample doesn't delete the old sample — it just changes what that pad points to.
- Also support looping/layering a single snippet on its own.
- Pads triggered by click/tap (no keyboard shortcuts).
- Pad count: adjustable, default 9 (fills the 3-column pad grid to a clean 3×3, no partial row).
- **Every sample carries a `kind`** — `'recording'` (a plain mic take), `'note'` (one key of a built Instrument), or `'sequence'` (a bounced multi-hit playthrough recording, see Playthrough recording below) — derived from how the sample was made, not from analyzing its audio content (unreliable for a lightweight app). Drives the Library's at-a-glance type badge, though `'note'` samples are the exception — see the Library page bullet under Layout: they're real Samples under the hood but deliberately never shown in the Library's own grid.

### Instruments

- Lives in the Library, above the raw sample list — a place to build a **16-key keyboard** from either a bundled synth preset or one of your own recordings, then lay it across the pads in one tap.
- **Bundled pitched presets**: Piano, Bass, Lead, Pad, Pluck, Organ, Bell, Guitar — eight simple oscillator-plus-envelope synth patches (triangle/sine/sawtooth/square with an ADSR-ish envelope, no audio assets), not attempting to sound like real instruments, just distinct enough starting points to tell apart. Pad is a slow-attack sustained wash for holding a background loop; Pluck is a very short, snappy triangle for one-off hits; Organ layers a loud octave overtone on a square wave for a thick, buzzy sustain; Bell is a bright sine with a slow-decaying overtone for a struck-metal character; Guitar is a lowpass-softened sawtooth with a quick pluck-then-settle envelope. Each is rendered offline (via `OfflineAudioContext`, no live `AudioContext` needed) at 16 ascending semitones from a root frequency — one patch, pitch-shifted across the keyboard.
- **Drum Kit — a structurally different preset**: 16 *distinct* percussion voices (Kick, Snare, Closed/Open Hat, Low/Mid/High Tom, Clap, Rimshot, Cowbell, Crash, Ride, a second Kick/Snare variation, Shaker, Tambourine — see `engine/drumSynth.ts`), not one sound pitch-shifted across the keys — a kick doesn't sound like a snare played faster, so each key gets its own independent offline render instead. Built from the same "no audio assets" synthesis approach as the pitched presets: tonal voices (kick/tom/cowbell) are a sine with a fast downward pitch sweep or a bandpassed square pair, noise-based voices (snare/hi-hat/rim/crash) are filtered white noise with a decay envelope, and clap layers three quick noise bursts instead of one smooth decay.
- **From a recording**: pick any existing library sample as the root note; the app pitch-maps it across the same 16-key range by baking a `detune`d offline render into a new buffer per key — the same mechanism the live pitch dial already uses, just rendered once instead of applied at playback time. The picker excludes samples that are themselves already-generated instrument keys, so you can't accidentally build an instrument out of a synthesized note.
- **Every key is a real library Sample** — no separate instrument-playback path, drum kit included. This means an instrument's keys get full trim/effects/loop/mute once on a pad, exactly like any recording.
- Deleting an instrument removes its generated key samples from the library too (unassigning any pad using one), so building a few instruments to try out doesn't leave a trail of orphaned samples behind.
- Laying an instrument across the pads is **Instrument Mode**, a pad-grid setting (see Pad Playback Behavior below), not a Library action — building an instrument and applying it are two separate steps in two separate places. For a drum kit this means pad 1 becomes Kick, pad 2 becomes Snare, and so on down the fixed voice order — a familiar drum-machine-style layout once applied.

### Playthrough recording

- The **Mic / Mix source switch** beside the record button in the tab bar (`RecordSourceToggle`, independent of the pad-grid mode — see Layout) changes what holding Record captures: off (default), it records from the microphone as always; on, it captures a live mix of whatever the app is actually playing during the hold — every currently-looping pad plus every manual tap/gate, mixed exactly as heard — instead.
- **Not mutually exclusive with loop mode or instrument mode.** The whole point is recording a playthrough of loops you've already started running, or of an instrument you're playing live by hand — those are pad-grid concerns, this is a recording-source concern, and the two axes are independent.
- **Implementation**: every playback node connects to a shared master bus (`AudioEngine.getMasterBus`) instead of `ctx.destination` directly; starting a playthrough recording taps that bus with a `MediaStreamAudioDestinationNode` and records the resulting stream with `MediaRecorder` — the same mechanism `useRecorder.ts` already uses for the microphone, just fed a synthetic Web Audio stream instead of `getUserMedia`, so it needs no microphone permission at all. The metronome click and a recording's own preview-loop (see above) deliberately bypass the master bus, connecting straight to `ctx.destination`, so neither one ever bleeds into a playthrough capture.
- Bounced samples land in the library tagged `kind: 'sequence'`, reviewed through the exact same popup a mic recording uses. Each one carries its `sequenceTrace` — the exact sample id (or none) placed in every cell at bounce time, independent of the current active pattern — so it can be **loaded back later as a real, playable pattern**: a `LoadSequenceButton` (the Library card's "Load" action, or the Sequencer page's own "Load sequence" picker) confirms first, showing exactly how many steps/hits will come back — e.g. "Loaded 16 steps, 2 hits restored," or "...12 of 16 hits restored — 4 samples no longer in the library" for hits whose sample has since been deleted (those surface as a visual-only ghost marker instead, the same look the hide/restore trace flow already used). Loading replaces the active pattern's current content — it is not a merge.
- This replaced an earlier, narrower mechanism (Instrument Mode specifically triggering an offline re-render of logged pad-press events) — the live master-bus tap is strictly more general: it works regardless of which pad-grid mode is active, and captures sustained loops, which the discrete-hit approach couldn't.

### Pad Playback Behavior

- **Loop Mode and Instrument Mode are mutually exclusive playback selections; Mixer Mode is a non-destructive level-control overlay.** Loop and Instrument change what a pad press means, so selecting either turns the other off. Mixer replaces pads with faders temporarily but keeps the selected instrument underneath, returning to that same playable layout when it closes. All of them live on one labeled switch — **`PLAY · LOOP · KEYS · MIX`** (`PadModeSwitch`) — at the top of the pad module: Play turns every mode off (cleaning up a quick Keys instrument and restoring the pads it covered); Keys always asks which instrument first, and tapping it again swaps; from Mix, Keys returns to the instrument already underneath without asking; tapping Mix again leaves it.
  - **Loop mode off** (the baseline, regardless of the other modes): a pad **gates** — pressing plays the sample and releasing stops it immediately, every time, regardless of how long the press was held. Hold to let it ring out; release early to cut it short. (An earlier version only gated once a press crossed a ~200ms hold threshold, letting a quick tap always play through in full — gating is the only playback style now, no hold needed to reach it.)
  - **Loop mode on**: tapping a pad toggles its loop on or off directly instead of playing a one-shot; gating doesn't apply there, since a loop toggle is discrete. Multiple pads loop together freely (see Sync below). This replaced an even earlier design where a pad had its own dedicated Loop button in the action bar.
  - **Instrument mode on** (the **Keys** position of the mode switch): selecting it always prompts "choose an instrument" first when turning it on — there's no implicit "whatever was there before." The picker offers two groups: **Quick presets** (every bundled synth preset plus Drum Kit — picking one builds a brand-new instrument on the spot, no Library visit required) and, once any exist, **Your library** (instruments already built deliberately via the Library page). Either way, picking one lays its keys across the visible pads (confirmed first if any pad already has a sound). A quick-built instrument is replaced atomically when another quick preset is chosen, removing its generated key samples so experiments do not pile up; an instrument applied from "Your library" is never auto-removed. Tapping Instrument Mode while it is already active reopens the picker without changing the current pads, so replacement is direct rather than destructive. Pads keep playing exactly like the loop-off baseline (gate) — the point is playing the instrument by hand, not a new pad-tap behavior — but every pad holding one of an instrument's keys shows a small badge with **both** that key's 1-based number **and** a glyph identifying what it actually is: for the Drum Kit specifically, a distinct icon per voice (🥁 kick, 🪘 snare, ✨ hi-hat, 🛢️ tom, 👏 clap, 🎯 rimshot, 🛎️ cowbell, 💥 crash — see `utils/instrumentIcon.ts`'s `drumVoiceIcon`), since a kick and a snare are genuinely different sounds, not two ends of one pitch range; for every pitched preset or recording-based instrument, the instrument's own single glyph (🎹 for Piano, 🎸 for Guitar/Bass, etc. — the same `instrumentIcon()` already used in the instrument pickers) repeated on every key, since those keys really are all the same sound, just pitch-shifted. Recording while playing an instrument works the same way as recording anything else — see Playthrough recording above if you want the performance captured as a single new sample.
  - **Mixer mode on**: pads stop being tap targets entirely and become vertical fader sliders — dragging (or just tapping a spot) sets that pad's `mixLevel` from the vertical position within the tile (top = 100/unity, bottom = 0/silent), shown as a colored fill plus a percentage readout. Nothing plays from touching a fader; it is a mixing surface, meant to be used while a pattern or loops are already playing. Active instrument-key badges remain visible in this view, and exiting it restores the Instrument Mode selection unchanged. `mixLevel` is deliberately a separate value from the Volume effect dial (see Dials/Controls) — a quick, always-in-reach "how loud does this sit in the mix" control, not a character/boost dial you set once while editing a sound. Dragging a fader on a currently-looping pad updates its actual output live, the same "dial changes are audible immediately" behavior every other pad dial has.
- **Loop sync**: starting a new loop while at least one pad is already looping doesn't cut in immediately — it's quantized to the next bar boundary (one measure at the current BPM) so layered loops stay in phase with each other, the same way a DAW's quantized launch works. The very first loop in a group always starts immediately and becomes that group's beat reference; once every loop stops, the next one to start resets the reference. `isPadLooping` (and so the pad's "looping" visual) goes true as soon as a loop is scheduled, even if its audible start is still up to a bar away.
- **Retriggering a one-shot pad**: layers freely — each tap fires a new overlapping playback instance, standard sampler behavior. This is also what naturally happens when a manual tap coincides with a sequencer step firing the same pad; no special-casing needed.
- **Sequencer sound history**: a programmed cell captures the exact sample ID on its pad at the moment it is added. Reassigning the row affects only later cells; existing Piano 1 steps stay Piano 1 while newly entered Guitar 1 steps play Guitar 1. The row's mute, trim, effects, and mix controls remain live row-level controls.
- **Shrinking pad count**: purely a display/trigger-surface control. Data for pads above the new count is retained in state, not deleted, and reappears if the count is grown back. (No confirmation dialog needed since nothing is actually discarded — this only applies to pad *slots*; explicitly deleting a sample from the library or clearing a pad is a separate, deliberate action.)
- **Mute**: independent of loop and of having a sample assigned — a muted pad produces no sound at all, from a manual tap or a sequencer step, without losing its sample assignment or its programmed steps. Visually dimmed so it's clear why tapping it does nothing. Distinct from "empty" (no sample) and from clearing a pad's data.
- **Effects bypass**: a reversible per-pad toggle (Pads-page action bar, directly below Mute) that plays the pad as if every effect dial were neutral, without touching the stored dial values — turning it back off restores exactly what was dialed in. Distinct from the Edit page's "Reset dials," which actually zeroes the values; bypass is non-destructive and just changes what's audible right now, live on a currently-looping pad too.
- **Whole-grid effects menu**: the FX button in the pad module header opens a popup that acts on every visible pad at once rather than one at a time — apply one of the eight Filter/Grit/Echo/Reverb presets (see Dials/Controls), or **live Filter/Grit/Echo/Reverb dials of its own** (dragging one dispatches `SET_ALL_PADS_EFFECT` across every visible pad, the same scope a preset touches), bypass or restore every pad's effects together, or reset every pad's dials to neutral. A shared `EffectsSwitch` control (a real switch, matching the Loop Mode look) sits merged into the popup's own heading rather than as a separate backward-labeled button, so on/off reads unambiguously at a glance — the per-pad Edit page's effects panel uses the same component. Applying a preset or resetting dials asks for confirmation first if any visible pad already has a non-neutral dial (same overwrite-confirmation pattern as applying an Instrument to the grid), since either action overwrites per-pad customization across the whole grid in one tap; bypass/restore doesn't ask, since it's fully reversible and touches no stored values. Live-updates any pad that's currently looping, the same as a single dial edit on the per-pad Edit page. **Tied to whichever instrument currently occupies the pads** (`Transport.currentInstrumentId`, set whenever an instrument or loop preset is laid across the grid): dragging a dial or applying a preset also saves the resulting combo onto that instrument's own `effectsPreset`, and re-applying the instrument later — after switching away and back — always re-lays its saved combo (or neutral, if it never had one), so one instrument's dialed-in character never leaks onto a different instrument sharing the same pad slots. Closing the per-pad effects editor (the ✕, the backdrop, or switching to a different pad's edit view) always stops that pad's loop if it was looping, regardless of which of those closed it — looping there is for auditioning while dialing in, not a performance meant to outlive the editor. **On mobile, the open popup floats free and follows whichever pad was last played** rather than staying pinned under the header button — the pad grid can run much taller than the header, so a fixed anchor point could end up far from where you're actually playing. Portaled to `document.body` (like every other popup — see Layout) and positioned by JS against either the header button (wide desktop layout, where reachability isn't a problem) or the last-tapped pad's own on-screen position (mobile), flipping above/below and clamping horizontally to always stay fully inside the viewport. Since following can occasionally land the panel over its own toggle button, it also carries its own ✕ close control whenever it's in this floating mode, so there's always a guaranteed way to dismiss it.

### Loop presets

- A small, fixed library of bundled **preset loops** — one bar (16 steps) each, entirely synthesized, no audio assets — offered from a menu on the Sequencer page (top-right of its header) as a shortcut to programming a pattern by hand.
- Grouped into three categories, **five presets each** — **Drums** (Four on the Floor, Boom Bap, Disco Hats, Breakbeat, Trap Hats — a full mini-groove per preset, not one drum hit repeated), **Bass** (Bass Pulse, Walking Bass, Octave Bounce, Syncopated Bass, Root and Fifth), and **Melody** (Arpeggio Up, Simple Riff, Descending Run, Call and Response, Bouncy Hook).
- **Picking a preset builds the instrument it needs and writes its exact pattern onto the grid, in one step**, via a single `APPLY_LOOP_PRESET` reducer action. For a Drums preset that's the default Acoustic Drums kit (`buildDrumKitKeys`, falling back to the synthesized model exactly like any other recorded voice if the CC0 samples can't be fetched); for a Bass/Melody preset it's that preset's own pitched patch spread across the keyboard (`buildInstrumentKeysFromPreset`, deliberately using `voice: 'pluck'` rather than `'bass'`/`'guitar'` so a loop pick never waits on a network fetch) — the same builders `InstrumentModeButton`'s Quick presets use, so the result is a normal instrument, not a special "loop" object. Each hit's voice/pitch maps deterministically to a pad index (`padIndexForHit` in `engine/loopPresets.ts`: a drum hit's pad is that voice's index in `DRUM_KIT_VOICES`, a tone hit's pad is its semitone offset), so the action can build the instrument, resize the grid to its key count (the same "grid follows the instrument" behavior `APPLY_INSTRUMENT_TO_PADS` already has), and write each active cell's specific sample id into the active pattern's `steps` all at once.
- **Tracked as a temporary/"auto" instrument**, exactly like `InstrumentModeButton`'s own quick presets (`Transport.autoInstrumentId`/`autoInstrumentPadSnapshot`) — replacing or removing it restores the pads it covered via the same non-destructive snapshot mechanism. The programmed sequencer steps themselves keep working afterward regardless, since a step remembers the exact sample id that filled it, independent of whether the instrument that built it is still around (`REMOVE_INSTRUMENT` only deletes a key sample once no pattern cell references it anymore).
- **The menu's own presets are shown compactly**: each card is just a name and a tiny multi-row step-grid preview — one row per distinct voice/pitch the preset actually uses, in the same low-to-high pad order it lands on the real grid in, drawn in the same "rows of 16 steps" shape as the real Sequencer grid rather than a big tap-to-play card. No audio plays from browsing the menu; a pick is a one-way "load this pattern" action, asking for confirmation first if the current pattern or any pad already holds something (the same overwrite-confirmation pattern Instrument Mode's own apply uses).

## Dials / Controls

- Audio effect dials: volume, speed, pitch, filter, pan, grit, echo, reverb — eight, per-pad (each pad has its own settings, independent of which library sample it currently references). Ordered on the edit page by how often each gets reached for in practice, most to least: Volume (adjusted on nearly every pad), Speed/Pitch (the classic sample-flipping moves), Filter (a common tone-shaping tweak), Pan (a quick spatial-placement tool reached about as often), then Grit/Echo/Reverb (occasional character/space effects, Reverb the most occasional and transformative of all) last.
  - **Range is bipolar: -100 (full one way) .. 0 (neutral, no change) .. +100 (full the other way)**, not 0–100 with 50 as an implicit midpoint — "50%" reads as "half speed," which is misleading when 50 actually meant neutral. 0 always means "no change" now. Dials snap to 25-point anchors (-100, -75, -50, ... 100), so a drag to 76 lands on 75.
  - **Speed → `AudioBufferSourceNode.playbackRate`.** -100 = 0.5x, 0 = 1x (unchanged), +100 = 2x.
  - **Pitch → `AudioBufferSourceNode.detune`.** Plain `playbackRate` changes pitch and speed together (it's just resampling) — using `detune` for pitch keeps the two dials genuinely independent without needing a phase vocoder or other heavy DSP. -1200..+1200 cents (one octave either way), 0 at dial 0. This only works within `detune`'s practical range; that's an accepted limitation, not a bug.
  - **Filter → a bipolar tone control**, not a one-directional sweep: negative values progressively muffle (lowpass, cutoff dropping as the dial goes further negative), positive values progressively thin the sound out (highpass, cutoff rising), 0 is neutral (`allpass`, negligible audible effect — kept in the graph rather than removed, so the node topology never changes while a pad loops). A single `BiquadFilterNode` whose `type` and `frequency` both change with the dial.
  - **Volume → a `GainNode`.** -100 = silent, 0 = unity (unchanged), +100 = a 2x boost that can drive the signal into clipping if pushed hard — an accepted, occasionally desirable side effect, not a bug. Per-pad, so one pad can sit quieter in the mix than another without touching the shared sample it references.
  - **Grit → a `WaveShaperNode`**, a character dial rather than a one-directional "amount of distortion" knob: negative crushes the sound into a harsh, quantized, digital lo-fi texture (fewer effective bit-depth steps the further negative), positive drives it into warmer, analog-style soft-clip saturation (a `tanh` curve, more aggressive with distance from 0), 0 is clean/untouched (identity curve, node kept in the graph either way — same "never rewire the topology" reasoning as Filter's allpass).
  - **Echo → a `DelayNode` + feedback loop**, one effect with two textures rather than a plain wet/dry knob: negative is a tight, quick slapback (a short delay, closer to doubling than a distinct repeat), positive is a longer, spacier delay with more audible repeats, 0 is fully dry. Delay/feedback/wet-mix nodes are always wired into the graph (at 0 gain when the dial is neutral) so turning it on mid-loop needs no graph surgery — same pattern as Filter and Grit.
  - **Pan → a `StereoPannerNode`.** A plain, one-directional mapping (no "two textures" split, unlike Filter/Grit/Echo/Reverb — a stereo position doesn't have two characters either side of neutral): -100 is hard left, 0 is centered, +100 is hard right. Applied after every other effect and after Mixer Mode's fader, so it positions the pad's whole finished output, echo/reverb tails included, rather than just the dry path.
  - **Reverb → a `ConvolverNode`**, the same "one effect, two textures" bipolar shape as Echo: negative is a small, tight room (a short decay, subtle presence), positive is a large, spacious hall (a long decay, more wash), 0 is fully dry. The room character comes from a synthetic impulse response — decaying white noise generated on the fly (`buildReverbImpulse`), not a recorded/sampled one — so like every other effect here it needs no audio asset. A parallel convolution branch off the same dry signal Echo branches from, mixed back in alongside it; always wired into the graph (wet at 0 when neutral) for the same "never rewire the topology" reason as the others.
  - **Changes apply live to a pad that's currently looping** — dragging a dial audibly updates the sustained sound in real time (via `AudioParam.setTargetAtTime` for a click-free ramp on every dial except Grit and Reverb, whose `WaveShaperNode.curve`/`ConvolverNode.buffer` aren't `AudioParam`s and so snap rather than ramp — an accepted, minor departure since both read as a character/room "jump" anyway, not a continuous sweep; Reverb's wet-mix level still ramps smoothly, only the room-size character itself snaps), not just the next trigger. One-shot instances already in flight aren't retroactively editable (there's no single "the" instance once several are layered).
- Rhythm dials: beat pattern / step sequencer controls, 16-step grid.
- Tempo: adjustable BPM dial for the sequencer (range 40–240).
- **Metronome**: an optional synthesized click (no sample/asset — a short oscillator blip) on quarter-note beats, accented on the pattern's downbeat. **Fully independent of the play/pause button** — its own toggle starts and stops it directly, whether or not the sequencer is playing; it shares the same lookahead clock as the sequencer so the two stay phase-locked whenever both happen to be on, but pressing Play never starts or stops it and pressing the metronome button never starts or stops sequencer playback. Pressing Play always (re)starts the pattern at step 1, resyncing the metronome's click to that downbeat as a side effect if it was already ticking on its own. Its toggle lives in the always-visible transport strip alongside tempo — on every page, independent of play/stop.
- Every slider in the app earns its place as a slider (BPM, the six dials) — continuous ranges where fine control matters. Discrete, coarse, rarely-adjusted settings (pad count) use a stepper (−/+ buttons) instead, since a slider is the wrong control for "occasionally nudge an integer between 1 and 16."
- Every dial (and the trim control) has a tap-to-open info icon explaining what it does — tap, not hover, since hover doesn't exist on the phone this app targets.

## Visual Design & Light Show

The UI is a small, compartmentalized "pocket groovebox": **easy to learn** (everything important is one tap and labeled), **hard to master** (drag-scrubbing tempo, drag-painting steps, whole-grid FX that follow the pad you're playing). Built as one design system in `index.css` — tokens first, then shared primitives, then modules — so every screen is assembled from the same parts instead of each control inventing its own look.

- **TRON two-tone palette**: near-black ground with a faint grid, **cyan** as the light the UI is made of, and **orange** for anything active, armed, or recording (a looping pad, the playing transport, an armed step-record, the record button, the playhead column). Per-pad rainbow colors are no longer drawn (`Pad.color` stays in the data model, unused by the UI) — pads are told apart by their number, sample name, and light.
- **Type**: small uppercase **JetBrains Mono** (Google Fonts, system-mono fallback) for labels, readouts and buttons — the hardware-panel voice — with the system font for names and body text.
- **Shared primitives** (one look each, used everywhere): `.btn` / `.icon-btn` / `.chip-btn` / `.chip`, `.segmented` (mode-style choices), `Stepper` (every −/value/+ count), `.switch` (every on/off, e.g. Effects), `.slider` (lit track; `.bipolar` lights outward from the centre for −100..100 dials), `.module` (every compartment, with lit corner ticks), and one `Overlay` sheet with a shared sticky header (title, subtitle, close ✕) for every popup. Icons all come from one file (`components/icons.tsx`) on the same 24-unit grid and stroke weight.
- **Light show** (`components/LightShow.tsx`): one `requestAnimationFrame` loop reads the audio engine and writes CSS custom properties straight onto the DOM — deliberately outside React's render cycle, so 60 fps of light costs a handful of `style.setProperty` calls rather than re-rendering the grid. Writes are scoped to the elements that use them (never `:root`, which would restyle the whole document every frame).
  - **Audio-reactive glow**: every pad (and its sequencer row chip) carries `data-glow-pad`; `--level` is that pad's actual output level — fast attack, ~150 ms visual release — so loud hits blaze, quiet ones barely light, and echo/reverb tails glow out. The engine taps each pad's output with an `AnalyserNode` in parallel (into a zero-gain sink), so metering never changes what's heard or what a playthrough recording captures.
  - **Hit bloom**: each hit flashes the pad white-cyan and throws a ring outward (Web Animations API). Timed to the audio clock via `AudioEngine.onPadHit`, so a sequencer step scheduled ~100 ms ahead flashes when it's *heard*, not when it's queued.
  - **Beat-synced pulse**: `--beat` swells on each downbeat and decays through the beat. It locks to the scheduler's clock (sequencer or metronome — `AudioEngine.markBeat`), else to the layered-loop epoch, else free-runs gently at the BPM so the idle screen still breathes. Drives the background grid, the transport's beat LED, and looping pads (which breathe orange on top of their own level). The scene-wide background glow also follows the master level.
  - The playhead crossing a lit step flashes it white-hot.
  - **`prefers-reduced-motion`** drops the bloom ring, the beat pulse, and all transitions/animations; level glow remains (it's state, not motion).

## Layout

A small app shell — persistent chrome around three pages, no router library (a plain page/navigation React context is enough for three flat destinations):

- **Scroll architecture**: the transport strip (top) and tab bar (bottom) are `position: fixed` chrome; `.app-shell` (the page content) is pinned exactly between them and scrolls *within itself*, so content can never render underneath either band, however tall it is or wherever it's scrolled to. (An earlier version reserved clearance as extra padding at the end of a normally-scrolling document; on a page about one screen tall that padding sat below the fold and content still rendered under the fixed controls.)
- **Every popup portals to `document.body`** (the shared `<Overlay>` sheet, `<ConfirmDialog>`, and the whole-grid FX panel), not just renders in place — `.app-shell` is `position: fixed`, which per spec makes it its own stacking context, so a popup left as its descendant has its z-index trapped inside that context and can end up visually *and interactively* underneath the fixed chrome no matter how high its own z-index reads. Found twice the hard way (a sheet's Cancel under the old play bar; the FX panel's close under the old top nav) — Playwright's "element intercepts pointer events" catches it immediately.
- **Every "are you sure?" prompt is a shared `<ConfirmDialog>`**, centered, at a higher z-index than sheets (a confirm is very often raised from *inside* an open sheet), with an orange edge since it's always guarding something destructive.
- **Transport strip** (top, every page): play/stop, a beat LED, tempo (a readout with − / + nudges that also **drag-scrubs** left/right or up/down, and takes arrow keys — Shift for ±10), loop-once vs. continuous, metronome, master volume (a small popover slider), panic stop-all, and settings. Tempo and the click matter as much while playing pads by hand as while sequencing, so the transport no longer hides on other pages.
- **Tab bar** (bottom, thumb zone): **Pads · Seq · [hold-to-record] · Library · Mic/Mix**. Record sits dead center, raised; the slot beside it switches what it captures — the microphone, or a live mix of whatever the app is playing (see Playthrough recording). In a combined layout (wide or landscape) Pads and Seq light up together, since both are showing.
- **Pads module (home)**: a compact header — pad count stepper, Gate / 1-shot, the whole-grid FX button, and the step-record arm — then the **labeled mode switch `PLAY · LOOP · KEYS · MIX`** (see Pad Playback Behavior), the grid (3 across up to 9 pads, 4 across beyond — a classic 4×4 at 16), and the **selected pad's action strip directly under the grid, inside the same module**: its number and sample name, then **Mute · FX (one-tap bypass) · Edit · Swap**. Each pad shows its number (lit when it holds a sound), a faint waveform, its sample name, and — while it holds an instrument key — that key's glyph and number. Selection is a set of lit corner brackets ("target lock").
- **Pad edit sheet** (Edit, or a pad's Edit action): header is the pad number and sample name; a pad switcher strip to hop between pads, one Loop-to-audition button, a **Trim** section (orange handles on the waveform, selected length readout, reset), and an **Effects** section (the on/off switch in its header, preset chips, eight bipolar dials whose value lights up once it leaves 0, reset). Closing it always stops an audition loop.
- **Sequencer module**: header (pattern name, step-count stepper in groups of four, the Loops preset menu), one toolbar — entry behavior on the left (**Gate**, **Preview**), pattern actions on the right (**Save**, **Load**, **Hide/Show**, **Clear trace**, **Clear**) — then the grid read as a timeline: beat groups set apart, each group's downbeat a touch brighter, the playhead column lit orange. Each row's number chip glows with that pad's live level and opens the library picker to swap its sound; **✕** removes a row (confirmed); dragging across cells paints a run; **+ Add row** grows the pad count.
- **Library page**: a grid of compact cards — tap the waveform to audition, tap the name to rename, facts as chips (kind · duration · loudness), which pads use it, and actions (put on a pad, load a saved sequence, reorder, delete). "Put on a pad" opens its own sheet (it used to render inline at the bottom of the page, off-screen on a phone). `kind: 'note'` samples (an instrument's generated keys) never appear here — they're transient backing data for a Keys performance.
- **Settings sheet**: project file Save / Load and Clear all. (Save/Load used to be duplicated in the top nav, and pad count duplicated here; each now lives in exactly one place.)
- **Wide-screen layout** (≥900px, `useIsWideScreen`): Pads and Sequencer side by side; a pattern of ≤16 steps stretches to fill its column instead of scrolling. Library stays a single full-width page. Sheets become centered dialogs from 700px up.
- **Landscape / ultra-wide** (`min-aspect-ratio: 2/1`, `useIsLandscapeLayout`): Sequencer stacked over Pads at full width; on a short landscape phone the transport strip and tab bar slim down so the device surface keeps most of the height.

## Data Model

Illustrative shape — the actual types will live in code, but this is the structure the reducer, engine, and UI are all built against:

```ts
type EffectId = 'pitch' | 'speed' | 'filter' | 'volume' | 'pan' | 'grit' | 'echo' | 'reverb'; // extensible — more effect types can be added later

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
  effects: EffectSetting[];  // ordered list, not fixed fields
  trimStart: number;         // 0-1, non-destructive playback window into the sample
  trimEnd: number;           // resets to (0, 1) whenever a different sample is assigned
  mixLevel: number;          // 0-100, a plain fader (not bipolar) — Mixer Mode's control, separate from the Volume effect dial
}

interface Instrument {
  id: string;
  name: string;
  source: 'preset' | 'recording';
  keySampleIds: string[];    // 16 keys, each a real Sample id — ascending semitones from the root for a pitched instrument, or 16 distinct fixed-order voices for the Drum Kit (no pitch to order by)
}

interface Pattern {
  id: string;
  name: string;
  // 16 cells per pad: null is empty; a sample id freezes the sound selected when that cell was added.
  stepCount: number; // starts at 16; user can extend in groups of four up to 64
  steps: Record<string /* padId */, Array<string | null>>;
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
  autoInstrumentId: string | null; // transient, like isPlaying/currentStep below — the instrument InstrumentModeButton just quick-built, cleaned up on its next "off"; never persisted
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
- Transient playback state (is it currently playing, which step the sequencer is on, which instrument InstrumentModeButton has quick-built and still owes a cleanup) is deliberately excluded from both the autosave record and the exported file — only project *data* is saved, not moment-to-moment session state, so loading a project always starts paused at step 0 rather than resuming mid-playback, and never carries over a stale "still owes auto-delete" pointer to an instrument that's now just part of the loaded project.

## Platform

- Runs in browser. "PWA" in name only for now — no offline support or installability required.

## Tech Stack

- React + TypeScript (strict) + Web Audio API
- Vite for build tooling
- Centralized reducer (`useReducer` + context) for app state — no external state library
- ESLint + Prettier

## Infrastructure & Logic Notes

- **Audio engine**: a standalone module owning one `AudioContext`. Each library sample is decoded once into an `AudioBuffer` (`MediaRecorder` → `decodeAudioData`); pads trigger playback by looking up their referenced sample and building a fresh `AudioBufferSourceNode` → effect chain → destination at trigger time.
- **Dials**: bipolar -100..100 sliders per pad, mapped internally to audio params as described above (detune for pitch, playbackRate for speed, filter frequency for filter, gain for volume, StereoPannerNode.pan for pan, a WaveShaper curve for grit, delay/feedback/wet for echo, a synthetic-impulse ConvolverNode + wet gain for reverb).
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

- Lands on the Pads page. Pads show a clear empty/filled state (an empty pad shows a faint tint of its own color and a "+" hint; a filled one shows its waveform and number).
- A floating record button, reachable from every page — recording was never meant to require being on a particular screen.

### Step 2 — Recording a sound

- Press and hold the record button to record; release to stop. No max length — however long you hold it. The hold gesture is the record/stop control; there's no separate start/stop tap to remember.
- Live waveform display while holding, for visual feedback.

### Step 3 — Reviewing, naming, and assigning (or discarding)

- After recording stops, you see a waveform preview and a name field, and you're prompted to choose which pad to assign it to (or "keep in library only," or discard it entirely).
- The recording isn't added to the library until you choose to keep it — discarding never touches the library, even briefly.
- If the chosen pad already has a sample assigned, you're asked to confirm before its reference is replaced — the old sample isn't deleted, just unassigned from that pad.

### Step 4 — Testing a pad / dials

- With loop mode off (the default), tapping a pad body gates it — pressing plays the sample, releasing stops it immediately wherever it is, every time. Hold to let it ring out; release early to cut it short. With loop mode on (its own toggle, next to record/metronome), tapping a pad starts or stops a continuous loop instead, in one tap each way — its on/off look always matches whether the pad is actually looping right now, and multiple pads loop together in sync.
- Tapping a pad surfaces an "Edit" action, opening a popup for dials/trim over whatever page you were on. That popup has its own pad-switcher strip and Loop button, so you can flip between pads and loop whichever one you land on without leaving the popup.
- Each dial is a slider (-100..100, snapping to 25-point anchors) with its signed value shown alongside — e.g. "+50", not "75%", so it's clear which direction and how far from neutral you are.
- A row of named presets above the dials sets Filter/Grit/Echo/Reverb to a tasteful combo in one tap (e.g. "Telephone," "Underwater," "Radio," "Crunch") — Pitch/Speed/Volume/Pan are left untouched.
- Drag the trim handles on the waveform to choose which part of the recording this pad plays — non-destructive, and independent per pad even when pads share a sample.
- A small tap-to-open info icon next to each dial and the trim control explains what it does.
- Per-pad reset button to snap all dials back to neutral (0, no change) in one click.

### Step 5 — Building a rhythm

- Once the pads are filled in, switch to the Sequencer page (its own dedicated screen, meant to be visited when it's time to assemble — not shared with anything else).
- Active steps show the pad's own color/icon (each pad gets a distinct color/icon when created, for quick visual ID — stable per pad regardless of which sample it currently references).
- Each row shows a small badge whenever that pad is independently looping (via its pad-page loop button), so the sequencer's programmed pattern is never confused with a separate loop already playing.
- Moving playhead highlights the current step across all rows as the sequencer plays.
- **Bounce to New Pad** renders the active sequence and assigns it to the next visible pad in one step; the existing **Bounce to Pad** keeps its review-and-choose-destination flow. The Pads header also has **+ Pad** and **− Pad** controls. Minus hides the last pad rather than deleting its assignment or sequence data, so it is restored if added again.

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
- Explicit "Clear All" button in the Settings sheet (gear icon in the transport strip) for when you actually want a blank slate — clears the autosave record too, so the cleared state stays cleared on the next reload rather than autosave silently restoring what you just cleared.
- A dedicated "stop all sounds" (panic) button in the transport strip — reachable from every page — panic-stops everything at once: every looping pad, every in-flight one-shot (including a long recording still playing out), and pauses the sequencer if it's running.

## Open Questions (deferred, not blocking)

- Library search (by name) is still open — rename/reorder/delete are in, search isn't yet needed at current library sizes.
- Cross-browser `MediaRecorder` quirks (Safari/iOS codec support) — not a concern unless this ends up used outside one browser.

## Notes

- Personal/casual project, not a portfolio piece — favor quick, fun iteration over polish in the *feature* set. The architecture itself, however, is built deliberately solid so growth doesn't require re-founding it later.
