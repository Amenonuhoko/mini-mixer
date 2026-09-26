# Musical variation and instrument realism

- Variation: seeded regeneration, remembered locks, evolving repeated parts and optional final-repeat transitions.
- Sound: compact CC0 recorded piano and marimba; expose which instruments use recordings; report download failures instead of silently substituting a synth.
- Verify: variation tests, source pitch checks, asset checks, production build, browser audition, then push preview.

## Completed checkpoints
- 89dc458: generator-based takes, persistent locks, role-specific song development, evolving repeats and transitions.
- 8c44255: real recorded piano/marimba assets, provenance, source labels and actionable load errors.
- Final verification: 189 tests pass; production build passes; three existing lint warnings only. All 23 source roots checked (largest measured deviation 17 cents); WAV data has headroom and silent edges. Browser verified piano/marimba loads and playback, evolving repeats, bass lock and final-repeat fills without changing duration. Physical phone audio quality remains a listening check.

## Remaining-instrument follow-up
- 26a2a44: correct the one-octave error in flute/clarinet/trumpet mappings; bundle original wind recordings, expand sax from 4 to 11 roots, and replace synthetic Pluck, Bell and Velvet Strings with harp, tubular-bell and bowed-violin recordings.
- bb185f5: warmer tine/pickup Electric Piano with register-dependent decay and gentle tremolo; Organ gains the missing drawbar, tonewheel foldback, softer percussion and rotary movement. Both remain models and are labelled Synth voice.
- Correct opposite-direction octave errors in guitar/bass sources; expand each to 7 verified roots and bundle them. All 11 recorded presets now load from the app's own assets. Existing project audio is preserved; reselect a preset to rebuild it.
- Retain 109 mono PCM source zones (26.25 MB) with provenance, CC0 licenses, silent edges and headroom. Only requested notes load; source cache capped at 24 zones. Automated pitch regression covers every wind/guitar/bass zone (56 total).
- Merged preview through 6ca41f6, preserving the newer Song/Seq/Mix layout and pattern-copy workflow.
- Browser checks before the merge: all four winds, recorded strings/bells/harp, Organ and Electric Piano build and trigger without errors. Final merged checks recorded below. Physical Pixel 9/Firefox listening remains unverified; single-shot recordings are not expressive legato/velocity-layer instruments.
- Final merged verification: 193 tests pass across 16 files; production build and diff check pass; lint has three existing Fast Refresh warnings. Guitar, Bass and Clarinet rebuild and trigger in the merged UI. The development tab needed a full reload after the multi-file merge (stale Fast Refresh context); no new playback errors followed the reload.

## Articulation and dense mobile playback
- Pixel 9 / Firefox feedback: crackles during dense beats. Increased phone latency request to 60 ms, scheduler horizon to 200 ms, and reduced voice budget to 24. Replaced stale AudioParam.value release fallback with an analytical envelope hold.
- Added per-pattern bank phrasing (Original, Short, Detached, Connected), note length limits, deterministic dynamics and Hear/Keep/Undo. Winds and bass default to detached notes; original full-sample playback remains selectable. Wind generation leaves breaths.
- Live playback and bounce share the same phrasing plan. Settings survive normalization, copying and the existing global audition snapshot. Playback plans are computed on musical edits instead of each scheduled step.
- Checkpoint: focused 43 tests pass; build passes. Remaining: browser UI and dense audio signal checks, full suite, documentation and push preview. Physical phone listening after the change remains required.
