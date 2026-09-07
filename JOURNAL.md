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
