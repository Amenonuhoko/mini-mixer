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
- **Audio engine: persistent channels, lightweight notes.** Every pad has one channel strip, built on its first note and kept (`engine/channel.ts`): filter → grit → volume → echo loop → Mixer fader → pan, with post-fader sends into **three shared reverb rooms** (0.6 s / 1.4 s / 3.2 s, built only once some pad asks for reverb; the Reverb dial's decay crossfades between them). A note is just a buffer source and a small envelope plugged into its pad's channel — nothing else is built per note. The envelope fades in a trimmed start and fades out a trimmed end or an early stop (gate release, voice steal, panic) over a few ms, so cuts never click. Voice limits (4 per pad, 32 on phones / 48 on desktop) fade out the oldest note rather than let notes pile up. The master stage — 0.7 headroom, a fast limiter, and a soft-clip ceiling — means the mix can never hard-clip however many layers stack. The offline bounce renders through the same channels, rooms and master stage, so a saved sequence sounds exactly like the live one. *Why:* the original design built a whole effect chain per note, including a freshly generated reverb impulse and its own convolver; on a dense generated beat that overloaded both threads (notes arriving up to seconds late, in bursts) and summed to 4.5× full scale (heavy clipping). See the 2026-09-25 journal entry.
- **Phone audio: slack, not just speed.** Crackling on phones is the audio thread missing its render deadline, so the engine picks an `AudioProfile` (`engine/audioProfile.ts`) from the device — a touch-first device (coarse pointer, no mouse) gets a **40 ms output buffer** (`latencyHint: 0.04`, ~30 ms more tap-to-sound latency), up to 32 voices (48 on desktop), a 0.18 s sequencer lookahead so main-thread stalls don't drop hits, and **light reverb rooms** (one mono convolution per room, widened with a 13 ms right-side delay — half the cost of the most expensive node). Everywhere: the master ceiling oversamples 2× (was 4×), a pad's filter is only wired into its channel while it's not neutral (unwired once the pad falls silent), every one-shot fades its last few ms (a recording that stops mid-waveform used to click at its natural end), and **loops play one seamless cycle** (`engine/loopSeam.ts`: the cycle's end crossfades into the audio just before its start, or the seam dips for 3 ms on an untrimmed sample — same length, so loops stay in time); a live trim hands over to the new cycle at the next loop boundary. The mic meter uses the app's one AudioContext (a second one is a second output stream), and on iOS the audio session is set to playback, switched to play-and-record only while recording, then back — iOS otherwise leaves the page in a quiet, crackly record session after the mic has been opened. A suspended or interrupted context is resumed on the next gesture and when the app becomes visible again. *Measured* in Chromium with the playout-stats underrun counter and the audio thread's CPU time: headroom before dropouts 45% → 85% (median of 5), audio-thread CPU on a Drum & Bass beat 12% → 7%, and with reverb + 4 loops 25–29% → 17%, zero dropouts in 8 s of the heavy case. See the 2026-09-26 journal entry.
- **Scheduler stalls skip, never burst.** If the main thread stalls, sequencer steps more than 100 ms late are skipped and the grid is rejoined, instead of firing every missed step at once.
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
- **Every sample carries a `kind`** — `'recording'` (a plain mic take), `'note'` (a note or chord a pad bank rendered for its sound), or `'sequence'` (a bounced multi-hit playthrough recording, see Playthrough recording below) — derived from how the sample was made, not from analyzing its audio content (unreliable for a lightweight app). Drives the Library's at-a-glance type badge, though `'note'` samples are the exception — see the Library page bullet under Layout: they're real Samples under the hood but deliberately never shown in the Library's own grid.

### Pad banks, mood & key ("what do I play?")

The blank-canvas problem is the first real obstacle for a non-musician: a grid of identical pads gives no direction. Pads are therefore organized by **musical role** and labeled by **what they play**.

- **Four banks, always**: **Drums · Bass · Chords · Melody** (`AppState.banks`, tabs at the top of the pad module). Each bank has its own ordered pad slots over one flat `pads` registry, its own showing count, and its own **sound** (`BankSound`: a bundled preset, a drum kit, or any of your recordings played as notes). The 32-pad cap is per bank. The Drums bank doubles as the **sampler**: recordings and library sounds are placed there, and its pad count is user-adjustable; melodic banks size themselves from their layout.
- **Mood first, key under the hood**: the project has one key (`AppState.key`: home note + scale + chord color). The key chip on the bank strip opens the **Mood** sheet — Bright, Chill, Dreamy, Soulful, Dark, Tense, Epic — each mapping to a key (e.g. Chill = D dorian with seventh chords). Musicians can open "Pick the key yourself" for home note (12), scale (major, minor, the modes, harmonic minor, both pentatonics, blues) and chords (simple triads / rich 7ths); a hand-picked key clears the mood (`mood: null`, shown as "Custom").
- **Layouts** (a Settings toggle, `padLayout`): **Guided** (default) only offers what fits the key — note banks lay each octave out as one row (column = scale degree, highest octave on top; 3 octaves for 5–6-note scales so the grid stays full), the chord bank is the key's seven chords plus home an octave up. **Free** goes chromatic — 24 semitones for note banks, a major and a minor chord (or their 7ths) on every root for chords. Each bank sits in its own register (bass from C2, chord roots F3–E4, melody from C4).
- **Labels** (a Settings toggle, `padLabels` — three independent parts, not skill levels): **Name** (`Am`, `E♭4`), **Feel** (a plain-language role relative to home: Home, Lift, Tension, Sad, Bright, Pull…), **Numeral** (`vi`, `♭3` — written against the major scale, the way musicians read modes). Name + Feel is the default. The key's home note/chord is always lit orange so there's somewhere safe to start and land.
- **Rendering**: picking a sound renders every pad's note once (offline, `engine/bankBuilder.ts`) — synth presets via their procedural model, recorded packs (guitar/bass/winds) by pitching the nearest recorded zone (falling back to the model offline), your recordings by pitch-shifting from middle C — and mixes chords from those notes. The bank also keeps a **note pool** (`noteSampleIds`, MIDI → sample): every pitch class its pads use, rendered from the lowest pad note to an octave above the highest (`notePool` in `music/theory.ts`) — the arpeggiator's and strum's raw material. Steps holding single pool notes (arpeggio recordings) follow key changes too: transposed with the home note, snapped to the nearest note of the new pool. All of it lands in one atomic `APPLY_BANK_BUILDS`.
- **Programmed steps follow**: a key or sound change keeps each step on the same pad (same degree, new key/sound — `remap: 'index'`); a layout change, or a key change to a scale with a different number of notes, moves each step to the pad with the nearest pitch (`remap: 'pitch'`, moving the cell to that pad's row). Old rendered notes are garbage-collected once no pad, bank or step uses them.
- **Character per sound**: the whole-bank Filter/Grit/Echo/Reverb combo is remembered per sound (`fxBySound`, keyed `preset:<name>` / `kit:<id>` / `recording:<sampleId>`), so switching a bank to another sound and back brings its character back with it.
- **Empty banks are one tap from playable**: an empty melodic bank shows three starter sounds plus "More".

### Perform: note repeat, arpeggiator, strum

What holding a pad does beyond one hit — the **Perform** chip in the pad module header opens an inline panel (inline rather than a sheet, so it can be changed mid-performance without covering the pads). The chip lights orange with a summary (`Arp 1/16`, `Rpt 1/8`, `Strum`) whenever something is on. Settings are project data (`AppState.perform`).

- **Hold: Off · Repeat · Arp**, at a tempo-synced **Rate** (1/4, 1/8, 1/8T, 1/16, 1/16T, 1/32).
  - **Repeat** retriggers every held pad — drums included, the classic MPC note repeat.
  - **Arp** walks the notes of every held pad one at a time: a chord pad's own notes, or several held note pads together; **Up / Down / Up·Dn / Rand** over **1 or 2 octaves** (octave-up notes come from the note pool, so they're real rendered notes, not pitch-stretched). Held drum pads with no notes are cycled through instead. **Latch** keeps it going after release until the next fresh press replaces the set.
- **Strum: Off · Up · Down** at **Fast / Med / Slow** (15 / 35 / 70 ms per note) rolls a chord pad's notes instead of hitting the mixed chord — on a plain hit or on every repeat. Each note plays at 1/√n level so a strum is as loud as the chord.
- **Timing** (`engine/performer.ts`): its own lookahead loop against the audio clock, like the sequencer's Scheduler. The first note sounds on the press itself (a performance must feel immediate); following notes snap to the beat grid whenever something is playing, else run from the press.
- **Step record captures all of it**, each note on the step it's actually heard on (`AudioEngine.stepAt`, from the step times the scheduler reports) rather than the UI's step counter, which runs ahead of the audio. Arpeggio notes are written as their single pool notes into the pressed pad's row; strums as the whole chord.
- Loop and Mix modes take the pads over, so they stop any performance; leaving the pad module ends a latched arpeggio; panic stops it too.

### Playthrough recording

- The **Mic / Mix source switch** beside the record button on the Pads page (in the bank strip) (`RecordSourceToggle`, independent of the pad-grid mode — see Layout) changes what holding Record captures: off (default), it records from the microphone as always; on, it captures a live mix of whatever the app is actually playing during the hold — every currently-looping pad plus every manual tap/gate, mixed exactly as heard — instead.
- **Not mutually exclusive with loop mode.** The whole point is recording a playthrough of loops you've already started running, or of a bank you're playing live by hand — those are pad-grid concerns, this is a recording-source concern, and the two axes are independent.
- **Implementation**: every playback node connects to a shared master bus (`AudioEngine.getMasterBus`) instead of `ctx.destination` directly; starting a playthrough recording taps that bus with a `MediaStreamAudioDestinationNode` and records the resulting stream with `MediaRecorder` — the same mechanism `useRecorder.ts` already uses for the microphone, just fed a synthetic Web Audio stream instead of `getUserMedia`, so it needs no microphone permission at all. The metronome click and a recording's own preview-loop (see above) deliberately bypass the master bus, connecting straight to `ctx.destination`, so neither one ever bleeds into a playthrough capture.
- Bounced samples land in the library tagged `kind: 'sequence'`, reviewed through the exact same popup a mic recording uses. Each one carries its `sequenceTrace` — the exact sample id (or none) placed in every cell at bounce time, independent of the current active pattern — so it can be **loaded back later as a real, playable pattern**: a `LoadSequenceButton` (the Library card's "Load" action, or the Sequencer page's own "Load sequence" picker) confirms first, showing exactly how many steps/hits will come back — e.g. "Loaded 16 steps, 2 hits restored," or "...12 of 16 hits restored — 4 samples no longer in the library" for hits whose sample has since been deleted (those surface as a visual-only ghost marker instead, the same look the hide/restore trace flow already used). Loading replaces the active pattern's current content — it is not a merge.
- This replaced an earlier, narrower mechanism (the old Instrument Mode specifically triggering an offline re-render of logged pad-press events) — the live master-bus tap is strictly more general: it works regardless of which pad mode is active, and captures sustained loops, which the discrete-hit approach couldn't.

### Pad Playback Behavior

- **Loop Mode and Mixer Mode are mutually exclusive; both live on one labeled switch — `PLAY · LOOP · MIX`** (`PadModeSwitch`) — at the top of the pad module. Play turns both off; tapping Mix again leaves it. What the pads *are* (drums, bass notes, chords) is the bank's job, not a mode — the old KEYS mode and its per-performance "auto instrument" were replaced by pad banks (see Pad banks above).
  - **Loop mode off** (the baseline, regardless of the other modes): a pad **gates** — pressing plays the sample and releasing stops it immediately, every time, regardless of how long the press was held. Hold to let it ring out; release early to cut it short. (An earlier version only gated once a press crossed a ~200ms hold threshold, letting a quick tap always play through in full — gating is the only playback style now, no hold needed to reach it.)
  - **Loop mode on**: tapping a pad toggles its loop on or off directly instead of playing a one-shot; gating doesn't apply there, since a loop toggle is discrete. Multiple pads loop together freely (see Sync below). This replaced an even earlier design where a pad had its own dedicated Loop button in the action bar.
  - **Mixer mode on**: the bank on screen gets **one volume slider for all its pads** (`Bank.volume`, 0–100, on top of each pad's own `mixLevel` — live in the engine via `setBankVolume`, and in bounces), the **effects for all its pads** (`BankEffectsPanel`: on/off, presets, the four character dials, save preset, reset) and a reserved space for a real mixer to come. The pads become plain tiles showing each pad's own level (or Muted); tapping one opens that pad's sheet (see Layout). Nothing plays from touching them. The pinned row under the grid swaps Gate / Perform / step-record for a hint.
- **Loop sync**: starting a new loop while at least one pad is already looping doesn't cut in immediately — it's quantized to the next bar boundary (one measure at the current BPM) so layered loops stay in phase with each other, the same way a DAW's quantized launch works. The very first loop in a group always starts immediately and becomes that group's beat reference; once every loop stops, the next one to start resets the reference. `isPadLooping` (and so the pad's "looping" visual) goes true as soon as a loop is scheduled, even if its audible start is still up to a bar away.
- **Retriggering a one-shot pad**: layers freely — each tap fires a new overlapping playback instance, standard sampler behavior. This is also what naturally happens when a manual tap coincides with a sequencer step firing the same pad; no special-casing needed.
- **Sequencer sound history**: a programmed cell captures the exact sample ID on its pad at the moment it is added. Reassigning the row affects only later cells; existing Piano 1 steps stay Piano 1 while newly entered Guitar 1 steps play Guitar 1. The row's mute, trim, effects, and mix controls remain live row-level controls.
- **Shrinking pad count**: purely a display/trigger-surface control. Data for pads above the new count is retained in state, not deleted, and reappears if the count is grown back. (No confirmation dialog needed since nothing is actually discarded — this only applies to pad *slots*; explicitly deleting a sample from the library or clearing a pad is a separate, deliberate action.)
- **Mute**: independent of loop and of having a sample assigned — a muted pad produces no sound at all, from a manual tap or a sequencer step, without losing its sample assignment or its programmed steps. Visually dimmed so it's clear why tapping it does nothing. Distinct from "empty" (no sample) and from clearing a pad's data.
- **Effects bypass**: a reversible per-pad toggle (Pads-page action bar, directly below Mute) that plays the pad as if every effect dial were neutral, without touching the stored dial values — turning it back off restores exactly what was dialed in. Distinct from the Edit page's "Reset dials," which actually zeroes the values; bypass is non-destructive and just changes what's audible right now, live on a currently-looping pad too.
- **Whole-grid effects menu**: the FX button in the pad module header opens a popup that acts on every showing pad of the active bank at once rather than one at a time — apply one of the eight Filter/Grit/Echo/Reverb presets (see Dials/Controls), or **live Filter/Grit/Echo/Reverb dials of its own** (dragging one dispatches `SET_ALL_PADS_EFFECT` across every visible pad, the same scope a preset touches), bypass or restore every pad's effects together, or reset every pad's dials to neutral. A shared `EffectsSwitch` control (a real switch, matching the Loop Mode look) sits merged into the popup's own heading rather than as a separate backward-labeled button, so on/off reads unambiguously at a glance — the per-pad Edit page's effects panel uses the same component. Applying a preset or resetting dials asks for confirmation first if any visible pad already has a non-neutral dial , since either action overwrites per-pad customization across the whole grid in one tap; bypass/restore doesn't ask, since it's fully reversible and touches no stored values. Live-updates any pad that's currently looping, the same as a single dial edit on the per-pad Edit page. **Remembered per sound** (`fxBySound`): dragging a dial or applying a preset saves the combo under the bank's current sound, and switching the bank back to that sound later re-lays it (or neutral, if it never had one), so one sound's dialed-in character never leaks onto another. Closing the per-pad effects editor (the ✕, the backdrop, or switching to a different pad's edit view) always stops that pad's loop if it was looping, regardless of which of those closed it — looping there is for auditioning while dialing in, not a performance meant to outlive the editor. **On mobile, the open popup floats free and follows whichever pad was last played** rather than staying pinned under the header button — the pad grid can run much taller than the header, so a fixed anchor point could end up far from where you're actually playing. Portaled to `document.body` (like every other popup — see Layout) and positioned by JS against either the header button (wide desktop layout, where reachability isn't a problem) or the last-tapped pad's own on-screen position (mobile), flipping above/below and clamping horizontally to always stay fully inside the viewport. Since following can occasionally land the panel over its own toggle button, it also carries its own ✕ close control whenever it's in this floating mode, so there's always a guaranteed way to dismiss it.

### Styles: presets as building blocks ("where do I start — and where next?")

Presets aren't a one-time starter: they're a pillar of building the beat. The library stays in reach while you work, and any bank's layer can come from any style, at any intensity, rerolled as often as you like.

- **Styles are data** (`src/styles/library.ts`, typed by `src/styles/types.ts`): Boom Bap, Lo-fi, Trap, House, Techno, Reggaeton, Afrobeats, Funk, Pop, R&B, Synthwave, Drum & Bass. Each declares a tempo range, the moods that suit it, a length (1/2/4 bars), a swing amount (consumed from Phase 3), a sound per bank, chord progressions as scale degrees, and rhythm lines. Adding a genre is adding an object — no code.
- **Rhythm lines** are one bar of 16ths: `x` always, `o` often, `-` sometimes, `.` never. Alternatives are lists. A one-bar line is rolled once and repeated so the groove is steady; the last bar is the style's fill, or a fresh roll — a variation on the turnaround.
- **The beat vs. its layers** (`AppState.groove`): the beat owns a seed, a length and a **chord progression**; each bank's layer owns its **style**, **take** (reroll count) and **intensity**. So layers mix across styles — Trap drums under a Funk bassline with Lo-fi chords — and still fit, because every layer follows the beat's chords in the project key.
- **Intensity** (0 sparse … 0.5 as written … 1 busy) reshapes a layer's rhythm: `o`/`-` fade out or in, below 0.5 even off-beat `x` hits thin (quarter-note hits always stay, so the groove keeps its spine), and above 0.5 hats, percussion, bass and melody start filling empty 16ths (never the kick/snare). Every step draws its own random number whatever the setting, so raising intensity only *adds* hits and lowering it only *removes* them — the slider feels continuous and live. Each bass note is decided per step, so notes don't reshuffle as hits come and go.
- **The generator** (`src/styles/generator.ts`) is pure and seeded: the same context always gives the same steps. It writes onto a bank's *actual* pads — drum roles (kick, snare, ghost, clap, rim, hat, open hat, ride, crash, tom, perc, shaker) resolved on whatever kit is loaded by voice name, then kind; bass rooted on every bar's downbeat, otherwise root / fifth / octave by the style's odds, with walk-ins to the next chord; chords matched by pitch set (every change always sounds); melody from a one-bar motif with strong beats snapped to the chord.
- **Where presets live** — both places, never modal:
  - **Styles drawer** (the ✦ button in the transport strip, on any page, or a sequencer bank's style chip): one non-modal drawer docked above the tab bar, with the page shrinking to sit above it, so the beat stays visible and playable. On top, **the mix**: each bank's current style and take, an intensity slider, a new take and remove; and the beat's chord names with **New chords** (a new progression from the chords layer's style — every preset layer is rewritten to follow). Below, **the library**: every style card has a one-tap button per layer (`Drm · Bass · Chd · Mel`, lit while that layer is playing — tap again for a new take) and a ✦ for a whole beat.
  - **Per-bank style chip**: each sequencer bank head shows its layer's style and take; tapping it opens the same Styles drawer (the per-bank strips that duplicated the drawer's mix row are gone — one place to pick, take and set intensity).
- **Whole beat**: the style's tempo; the current mood if the style suits it, else the style's first mood; every bank's sound; all four layers on a fresh pattern of the style's length. Confirms first if anything is programmed; the sequencer then folds every bank to its used rows.
- **Adding a layer** builds the style's sound only if the bank has none suitable (a sound you picked is kept) and tiles the layer across a longer pattern. The first layer of a beat sets its length and chords.
- Phase 2 beats saved with one style migrate to every layer in that style, same seed and progression (`normalizeGroove`).


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
  - **Changes apply live, to everything the pad is playing** — each pad has one persistent channel strip (see Audio engine below), so dragging a dial glides that channel's params (`AudioParam.setTargetAtTime`, click-free) and is heard at once on its loop and on any notes still ringing. Grit's curve snaps rather than ramps (a `WaveShaperNode.curve` isn't an `AudioParam`), and Reverb's room size crossfades between the three shared rooms. Pitch and speed belong to each note's own source, so those two reach the pad's loop live and every new note.
- Rhythm dials: beat pattern / step sequencer controls, 16-step grid.
- Tempo: adjustable BPM dial for the sequencer (range 40–240).
- **Metronome**: an optional synthesized click (no sample/asset — a short oscillator blip) on quarter-note beats, accented on the pattern's downbeat. **Fully independent of the play/pause button** — its own toggle starts and stops it directly, whether or not the sequencer is playing; it shares the same lookahead clock as the sequencer so the two stay phase-locked whenever both happen to be on, but pressing Play never starts or stops it and pressing the metronome button never starts or stops sequencer playback. Pressing Play always (re)starts the pattern at step 1, resyncing the metronome's click to that downbeat as a side effect if it was already ticking on its own. Its toggle lives in the always-visible transport strip alongside tempo — on every page, independent of play/stop.
- Every slider in the app earns its place as a slider (BPM, the six dials) — continuous ranges where fine control matters. Discrete, coarse, rarely-adjusted settings (pad count) use a stepper (−/+ buttons) instead, since a slider is the wrong control for "occasionally nudge an integer between 1 and 16."
- Every dial (and the trim control) has a tap-to-open info icon explaining what it does — tap, not hover, since hover doesn't exist on the phone this app targets.

## Visual Design & Light Show

The UI is a small, compartmentalized "pocket groovebox": **easy to learn** (everything important is one tap and labeled), **hard to master** (drag-scrubbing tempo, drag-painting steps, whole-grid FX that follow the pad you're playing). Built as one design system in `index.css` — tokens first, then shared primitives, then modules — so every screen is assembled from the same parts instead of each control inventing its own look.

- **TRON: Legacy look — relaxed, not hard neon**: dark, hazy architecture traced by soft **ice-blue** light lines (`--cyan` is a pale ice, not electric cyan), with a soft **amber** for anything active, armed, or recording (a looping pad, the playing transport, an armed step-record, the key's home pad). The background is a light shaft falling from above into haze, with a faint backlit **hex mesh** strongest at the sides (the corridor panels), pulsing gently with the beat. Panels (`.module`) are dark glass with a light line traced along the edge — brightest across the top, fading down the sides — and generous radii; the transport strip and tab bar end in light strips that fade out toward both ends. Glows are wide and soft (light bleeding through haze) and type weights are light. Pads are dark glass tiles with a thin edge light; the **selected pad** simply brightens its edge and softly blooms — no corner brackets or other hardware-panel decoration.
- **Type**: small uppercase **JetBrains Mono** (Google Fonts, system-mono fallback) for labels, readouts and buttons — the hardware-panel voice — with the system font for names and body text.
- **Shared primitives** (one look each, used everywhere): `.btn` / `.icon-btn` / `.chip-btn` / `.chip`, `.segmented` (mode-style choices), `Stepper` (every −/value/+ count), `.switch` (every on/off, e.g. Effects), `.slider` (lit track; `.bipolar` lights outward from the centre for −100..100 dials), `.module` (every compartment, with lit corner ticks), and one `Overlay` sheet with a shared sticky header (title, subtitle, close ✕) for every popup. Icons all come from one file (`components/icons.tsx`) on the same 24-unit grid and stroke weight.
- **Light show** (`components/LightShow.tsx`): one `requestAnimationFrame` loop reads the audio engine and writes straight onto the DOM — deliberately outside React's render cycle. Every write is a plain `opacity` on a layer that exists only to glow (each pad's `.pad-glow`, each row's `.row-glow`, the beat LED, the background mesh and shaft), only when it moved enough to see, so the compositor fades it without restyling anything else. The glowing elements are looked up again only when the page's structure changes. (An earlier version wrote CSS custom properties, which restyled every pad every frame and starved the sequencer's timer on phones.)
  - **Audio-reactive glow**: every pad (and its sequencer row chip) carries `data-glow-pad`; its glow layer's opacity is that pad's actual output level — fast attack, ~150 ms visual release — so loud hits blaze, quiet ones barely light, and echo/reverb tails glow out. The engine taps each pad's output with an `AnalyserNode` in parallel (into a zero-gain sink), so metering never changes what's heard or what a playthrough recording captures.
  - **Hit bloom**: each hit flashes the pad white-cyan and throws a ring outward (Web Animations API). Timed to the audio clock via `AudioEngine.onPadHit`, so a sequencer step scheduled ~100 ms ahead flashes when it's *heard*, not when it's queued.
  - **Beat-synced pulse**: `--beat` swells on each downbeat and decays through the beat. It locks to the scheduler's clock (sequencer or metronome — `AudioEngine.markBeat`), else to the layered-loop epoch, else free-runs gently at the BPM so the idle screen still breathes. Drives the background grid, the transport's beat LED, and looping pads (which breathe orange on top of their own level). The scene-wide background glow also follows the master level.
  - **The playhead** is marked by the light show too — `data-playhead` on the column being *heard* right now (`AudioEngine.getPlayheadStep`), not React state: no re-render of the app on every step, and in time with the audio rather than the scheduler's ~100 ms lookahead. Crossing a lit step flashes it white-hot.
  - **`prefers-reduced-motion`** drops the bloom ring, the beat pulse, and all transitions/animations; level glow remains (it's state, not motion).

## Layout

A small app shell — persistent chrome around four pages, no router library (a plain page/navigation React context is enough for four flat destinations). **Arrangement rule (mobile first):** what you touch while playing sits at the bottom, in thumb reach; status and set-and-forget controls sit at the top; every function lives in exactly one place:

- **Scroll architecture**: the transport strip (top) and the **bottom stack** (the Styles drawer when open, and the tab bar) are `position: fixed` chrome; the stack's height is measured (`--bottom-h`) and `.app-shell` (the page content) is pinned exactly between them and scrolls *within itself*, so content can never render underneath either band, however tall it is or wherever it's scrolled to. (An earlier version reserved clearance as extra padding at the end of a normally-scrolling document; on a page about one screen tall that padding sat below the fold and content still rendered under the fixed controls.)
- **Every popup portals to `document.body`** (the shared `<Overlay>` sheet, `<ConfirmDialog>`, and the whole-grid FX panel), not just renders in place — `.app-shell` is `position: fixed`, which per spec makes it its own stacking context, so a popup left as its descendant has its z-index trapped inside that context and can end up visually *and interactively* underneath the fixed chrome no matter how high its own z-index reads. Found twice the hard way (a sheet's Cancel under the old play bar; the FX panel's close under the old top nav) — Playwright's "element intercepts pointer events" catches it immediately.
- **Every "are you sure?" prompt is a shared `<ConfirmDialog>`**, centered, at a higher z-index than sheets (a confirm is very often raised from *inside* an open sheet), with an orange edge since it's always guarding something destructive.
- **Transport strip** (top, every page — status and set-and-forget): a beat LED, tempo (hold − / + to run, drag the readout, tap it for the tempo panel — see `TempoControl`), loop-once vs. continuous, metronome, master volume (a small popover slider), **✦ Styles** (the one door to the Styles drawer, on any page), panic stop-all, and settings. Play moved to the bottom bar.
- **Tab bar** (bottom, thumb zone): **Pads · Seq · [▶ Play] · Song · Library** — Play is the button pressed most, so it sits raised dead center, right under the thumb (`PlayButton`). Recording moved to the Pads page. In a combined layout (wide or landscape) Pads and Seq light up together, since both are showing.
- **Pads module (home)**: the **bank tabs `DRUMS · BASS · CHORDS · MELODY`** (a dot marks banks with sounds); one **bank strip** — the bank's sound button (its sheet also holds the Drums pad count), the orange mood/key chip, and **hold-to-record** with its **Mic / Mix** source switch; the grid (a melodic bank uses its layout's width — a scale per row, taller pads when wider than 4; Drums goes 3 across up to 9 pads, 4 beyond); and, **pinned to the bottom of the page while the grid scrolls** (`.pad-play-dock`, `position: sticky`; it lets go when the page area is short — Styles open, a landscape phone — via a container query), how the pads respond: the **labeled mode switch `PLAY · LOOP · MIX`**, then Gate / 1-shot, the **Perform** chip (opens the perform panel just above — see Perform) and the step-record arm — or, in Mix, a hint and **All pads FX**. There is no separate selected-pad bar: a pad's actions all live in Mix, and row fills in Seq. Melodic pads show their label (name / feel / numeral); drum pads show their number, a faint waveform, their sample name and — for a kit — the voice's glyph. Selection is a set of lit corner brackets ("target lock").
- **Pad sheet** (tap a pad in Mix; `PadEditOverlay`): a strip across the top switches between the bank's pads. **Level** (the same `mixLevel` as its fader) with **Mute**, and on Drums **Swap sound** / **Remove pad**; one Loop-to-audition button; **Trim** (orange handles on the waveform, selected length readout, reset); and **Effects** (the only on/off switch for the pad's effects, in its header; preset chips; eight bipolar dials whose value lights up once it leaves 0; reset). Closing it always stops an audition loop.
- **Sequencer module**: header — the **pattern picker** (which pattern is in the grid), the step-count stepper (groups of four) and **⋯ Pattern** (a sheet: rename, New pattern, Duplicate, **Copy from another pattern** — pick one, e.g. the Intro, and its steps, length and generator settings replace this pattern's (the Verse), asking first if it has steps; the copy is independent and keeps its own name and song links (`COPY_PATTERN_FROM`) —, **Save as sample**, Load sequence, Bar 1 → all, Hide/Show, Clear trace, Clear); one toolbar — how a tap on a step behaves (**Hold to hear**, **Preview**, **Paint**) and **Fill row** (one-tap fills — every beat/8th/16th, offbeats, 2 & 4, clear — for the selected row); then the grid read as a timeline: beat groups set apart, each group's downbeat a touch brighter, the playhead column lit orange. Each bank head has its style chip (opens the Styles drawer), Used rows only / Show all, and a confirmed Delete steps. Each row is named like its pad and glows with its live level; tapping the name hears and selects the pad (Fill row acts on it; the Pads page follows). Dragging along a row paints a run (always with a mouse; with **Paint** on for touch).
- **Song page** (its own tab): **Play whole song** and the ready-made structures, then the sections. Each section card: its number, name and **↑ ↓** across the top; its pattern and a **− ×N +** repeats stepper; its own **mix** (a per-bank on/off chip and volume slider — which banks play in that section and how loud; the pattern's steps are untouched) ending in **Ending / transition →**, which opens the **Ending / transition** sheet (`TransitionSheet`, see below) and shows the ending picked (e.g. "Ending: Build →"); **Edit this** (opens its pattern in Seq, looping that section); **▶ Play from here** (plays on to the end — stop it with Play); **Make this section unique** when its pattern is shared; **Duplicate** (a numbered copy right after — Verse → Verse 2 → Verse 3 — with its own identical pattern of the same name, so editing one never changes the other); and Remove. Then Add section / Save song / Export WAV. Auditioning a section switches Play to song playback; picking a pattern by hand in Seq's pattern picker switches it back to that pattern (the Pattern / Whole song toggle is gone). Start from a Verse/Chorus, Hook-first, or full-pop structure, then change any section. A template creates a distinct pattern for each unique part and links repeated parts to that pattern; existing named patterns are reused. Tap **Edit this** on a section to open its pattern and loop only that section, including its repeat count; stopping and restarting the transport keeps the same focused loop. **Song** takes you back, and **Hear whole song** starts the full arrangement. Each section shows which banks have programmed hits and can audition only that section or play from there through the ending. Seq notes when a bank is left out of the section being edited. Sections can be renamed, reassigned, copied, moved, removed, and repeated 1–32 times. Song playback follows the ordered timeline and can be rendered into one sample with **Save song** or downloaded with **Export WAV**. The arrangement and section mixes are included in autosave and project files; older projects open in Pattern mode.
- **Library page**: a grid of compact cards — tap the waveform to audition, tap the name to rename, facts as chips (kind · duration · loudness), which pads use it, and actions (put on a pad, load a saved sequence, reorder, delete). "Put on a pad" opens its own sheet (it used to render inline at the bottom of the page, off-screen on a phone). `kind: 'note'` samples (the notes/chords a bank rendered) never appear here — they belong to their bank and are replaced with it.
- **Settings sheet**: project file **Save project / Open project** and Clear all. (Save/Load used to be duplicated in the top nav, and pad count duplicated here; each now lives in exactly one place.)
- **Wide-screen layout** (≥900px, `useIsWideScreen`): Pads and Sequencer side by side; a pattern of ≤16 steps stretches to fill its column instead of scrolling. Library stays a single full-width page. Sheets become centered dialogs from 700px up.
- **Landscape / ultra-wide** (`min-aspect-ratio: 2/1`, `useIsLandscapeLayout`): Sequencer stacked over Pads at full width; on a short landscape phone the transport strip and tab bar slim down, so the device surface keeps most of the height.
- **Touch targets**: on a coarse pointer every control is at least ~34–40px (`@media (pointer: coarse)` raises chips, segments, steppers, sliders and the tempo nudges); the sequencer's step cells and row names keep the grid's 30px rows.

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
  music: { kind: 'note' | 'chord'; midis: number[] } | null; // what a melodic pad plays — drives its label and step remapping
}

type BankKind = 'drums' | 'bass' | 'chords' | 'melody';
type BankSound = { type: 'preset'; name: string } | { type: 'kit'; kitId: string } | { type: 'recording'; sampleId: string };

interface MusicalKey {
  tonic: number;                 // pitch class 0-11
  scale: ScaleId;                // 'major' | 'minor' | 'dorian' | … | 'blues'
  chordColor: 'triad' | 'seventh';
}

interface Bank {
  id: string;
  kind: BankKind;
  padIds: string[];              // every slot this bank has ever had, grid order
  visibleCount: number;          // how many of padIds show — shrinking is display-only
  sound: BankSound | null;
  columns: number;               // layout width (0 = auto for Drums)
  generatedSampleIds: string[];  // samples rendered for the current sound
  noteSampleIds: Record<string, string>; // MIDI → sample: the arpeggiator's note pool
}

interface Pattern {
  id: string;
  name: string;
  // 16 cells per pad: null is empty; a sample id freezes the sound selected when that cell was added.
  stepCount: number; // starts at 16; user can extend in groups of four up to 64
  steps: Record<string /* padId */, Array<string | null>>;
}

interface SongSection {
  id: string;
  name: string;
  patternId: string;
  repeats: number;                    // 1–32
  bankVolumes?: Partial<Record<BankKind, number>>; // 0–100 for this section
  excludedBanks?: BankKind[];          // removed from this section, reversible
}

interface Transport {
  bpm: number;                          // 40–240
  isPlaying: boolean;
  loopMode: 'once' | 'continuous';
  playMode: 'pattern' | 'song';
  currentSongSectionId: string | null; // live playhead, not saved
  metronomeEnabled: boolean;
  padLoopModeEnabled: boolean;          // global: tapping a pad toggles its loop instead of playing it
  padMixerModeEnabled: boolean;         // global: pads become drag-to-set volume faders; mutually exclusive with Loop Mode
  playthroughRecordingEnabled: boolean; // global: NOT mutually exclusive with the grid modes above — see Playthrough recording
}

interface AppState {
  samples: Record<string, Sample>;   // the arsenal, keyed by id — includes bank-rendered notes
  sampleOrder: string[];             // display/edit order for the library
  pads: Pad[];                       // every pad slot of every bank
  banks: Bank[];                     // Drums · Bass · Chords · Melody, always in that order
  activeBankId: string;
  key: MusicalKey;
  mood: MoodId | null;               // the mood that picked the key; null once set by hand
  padLayout: 'guided' | 'free';
  padLabels: { name: boolean; feel: boolean; numeral: boolean };
  fxBySound: Record<string, CharacterPreset>; // whole-bank Filter/Grit/Echo/Reverb per sound
  groove: {                          // the beat preset layers belong to — see Styles
    seed: number;
    bars: number;
    progression: number[];           // scale degrees, shared by every layer
    layers: Partial<Record<BankKind, { styleId: string; take: number; intensity: number }>>;
  } | null;
  perform: {                         // what holding a pad does — see Perform
    mode: 'off' | 'repeat' | 'arp';
    rate: '1/4' | '1/8' | '1/8T' | '1/16' | '1/16T' | '1/32';
    arpPattern: 'up' | 'down' | 'upDown' | 'random';
    arpOctaves: 1 | 2;
    latch: boolean;
    strum: 'off' | 'up' | 'down';
    strumSpeed: 'fast' | 'medium' | 'slow';
  };
  patterns: Pattern[];
  activePatternId: string;
  songSections: SongSection[];        // ordered pattern references, repeats, and per-section Drums/Bass/Chords/Melody levels
  transport: Transport;
}
```

A bank's `padIds.length` and `visibleCount` are deliberately separate: shrinking the pad count only lowers `visibleCount` (display-only), while the slots themselves only ever grow — this is what makes "shrink retains hidden data" representable without a separate archive structure.

## Saving

Reversed from the original "session-only, no persistence" decision once real use showed losing work on every reload was actually a problem worth solving.

- **Autosave to the browser (IndexedDB)**: every change — a new recording, a dial tweak, a step toggle — is written back automatically, debounced (~1.2s after the last change). The session record (pads, banks, patterns, settings) is small and rewritten each time; **samples live in their own store, one entry per sample, as raw PCM** — immutable, so each is written once (in small batches between frames) and deleted when the session stops using it. Saves run one at a time, the latest state winning. Version-1 autosaves (every sample inline as WAV) still load and move to this layout on the next save. Reload picks up right where you left off. Tied to one browser on one device; clearing site data or switching browsers loses it, same as any browser-storage-based persistence.
- **Explicit export/import as a project file**: a "Save" button in Settings downloads a self-contained JSON file (`beat-maker-<timestamp>.json`) with every sample's audio embedded as base64-encoded WAV, plus pads/patterns/transport. A "Load" button reads one back in (with a confirm step, since it replaces the current session) — portable across browsers and devices, and safe from autosave getting cleared. This is the deliberate backup/sharing mechanism; autosave is the "just don't lose my work" safety net.
- **Format**: one JSON object, `version: 1`, samples embedded inline as WAV rather than a separate zip/multi-file bundle — keeps the whole project in one file with no extra library (no ZIP dependency) and no separate-file-management UX. `AudioContext.decodeAudioData` reads WAV natively, so loading a sample back in reuses the exact same decode path recording already uses — no new audio-decode code needed.
- Transient playback state (is it currently playing, which step the sequencer is on) is deliberately excluded from both the autosave record and the exported file — only project *data* is saved, so loading a project always starts paused at step 0.
- **Banks, key, mood, layout, labels, per-sound FX, perform settings and the beat (seed, chords, each layer's style/take/intensity) are project data** and round-trip through both paths (`stateFromMeta` in `engine/projectFile.ts` is the one place both fill in defaults). Projects saved before pad banks — a flat pad list plus `visiblePadCount` — load as a Drums bank showing the same pads, with empty melodic banks, in the Bright mood.

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

### Sound and beat preset refresh

- **Make a beat** (top of the Sequencer only; `BeatStarter`): pick the **parts** — Drums · Bass · Chords · Melody — and press **Generate**. Every part picked gets fresh, randomly generated material from the chosen style (**🎲 Surprise me**, the default, picks a random style each press and names it); parts left out stay exactly as they are (`useGroove.regenerateLayers`), and all four — or an empty pattern — is a whole new beat (`startBeat`, which now builds sounds only for the parts it generates). **Options** (folded once there's a beat): style, Simple / Balanced / Complex, 1 / 2 / 4 bars (for a whole beat), **New sounds**, and the **Tweak** row — Sparser, Busier, More syncopated, New take, Add a fill, Opening crash, Short pause, Bass dropout — applied to the picked parts only and auditioned with Keep / Undo. It replaces the old Make a beat + Develop this beat pair (and the Song page's Develop your song).
- Six additional styles: Rock, Disco, Reggae, Afro Pop, Ambient and Arcade (`styles/extraStyles.ts`). Layer presets remain available for mixing individual parts.
- Seven additional instruments: Electric Piano, Marimba, Sub Bass, Velvet Strings, Chiptune, Rubber Duck and Bubble Keys (19 total). Rendered samples have DC removal, shared stereo normalization and gentle edge fades. Procedural generation yields between chunks and shares a two-job queue across banks.
- 18 consolidated effect presets with descriptions in Mix; Bitcrush uses quantization, Warm Tape uses saturation, and reverb impulses are damped. Presets and bypass update currently sounding one-shots as well as loops. Dry channels allocate no echo nodes.
- Mobile retains its 40 ms output-buffer hint, 180 ms scheduler lookahead, lighter reverb and seamless loops; pad glow updates run at 30 fps on coarse-pointer devices. Physical Pixel 9 / Firefox playback remains a device verification step.

### Guided song development

Song starts with structure choices (Simple, Hook first, Full pop and Electronic) and an explicit Play whole song action. Each section offers Hear, Edit, Duplicate and Remove; shared patterns are labelled and can be made unique. Editing loops that section and shows a Back to song link.

(Superseded: the Develop panels are folded into Make a beat — see above; the related-song generator's reducer action remains for the coming Ending / transition menu.) The Tweak transformations are Sparser, Busier, More syncopated, New take, Drum fill, Opening crash, Short pause and Bass dropout. Bank locks preserve exact notes; transformations reuse sample IDs without rebuilding sounds. Chords are not retriggered by Busier. Fill/crash need appropriate loaded kit voices.

Changes audition immediately with global Keep / Undo. Undo restores the original patterns, arrangement and editing context; later musical edits accept the draft to protect newer work. Autosave preserves the pre-audition version until Keep or a later edit. **Ending / transition sheet** (Song card → Ending / transition): None, **Drum fill** (snare/toms in the last beat), **Build** (a snare roll over the last bar: quarters, 8ths, then 16ths), **Cut out** (everything stops for the last beat) or **Bass drop** (bass stops for the last beat). A move is baked into the steps of the pattern the section ends on (`state/sectionEnding.ts`), so Edit this can fine-tune it: a section that repeats has its final repeat split off as "<name> ending" (repeats 1, same mix, `ending: { move, basePatternId, of }`), a single pass is pointed at its own copy, and song length never changes. Picking another move rewrites the ending from the original pattern; None takes it out and folds the split repeat back. Each pick previews with Keep / Undo (label "Ending") and plays the **handover** — the section's last two bars and the next section's first bar (`handoverRange`, audition scope `handover`) — which "Hear the handover" replays. Moves that would change nothing are disabled with the reason (e.g. Build needs a snare or clap in Drums). Endings are saved in autosave and project files.

### Recorded keys and deeper variations

Piano now uses 13 recorded Steinway zones and Marimba uses 10 recorded strikes from the CC0 VCSL library. The compact, mono WAV subset is 7.91 MB total, loaded on demand from the app host. Provenance, upstream revision and license are included in public/instruments. The sound chooser labels Real recording vs Synth voice. A recorded-source failure keeps the current bank and displays a retry message rather than silently using a synthetic substitute. Existing projects keep saved audio; reselect Piano or Marimba to rebuild their sound.

Variation locks are saved with each pattern. New take uses the style generator for generated layers and seeded within-beat rearrangement for manual layers. Related song parts have role-specific density and rhythms; Evolve repeated sections produces independent versions of repeated names. Optional fills, pauses and bass dropouts are placed on the last repeat only; no-op transitions are skipped. Keep/Undo preserves the audition workflow and song duration.

### Phrasing and mobile playback
Each sequencer bank has Phrasing: Original full samples, Short stabs, Detached notes, or Connected phrasing. Choose a maximum note length and dynamics, Hear the pattern, then Keep or Undo. Settings belong to the pattern and follow linked song sections, copies, saves and exports. Winds and bass default to detached notes; sustained synth/string presets default to connected notes. Wind generation leaves a short breath at phrase endings. Connected playback shapes existing recordings; it does not synthesize legato transitions or extend their sustain.
Phone playback requests a 60 ms output buffer, schedules 200 ms ahead and caps live voices at 24. Envelope release fallback reconstructs the scheduled level instead of reading an unreliable AudioParam value. Actual browser latency may differ from the request.
