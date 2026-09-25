# Musical variation and instrument realism

- Variation: seeded regeneration, remembered locks, evolving repeated parts and optional final-repeat transitions.
- Sound: compact CC0 recorded piano and marimba; expose which instruments use recordings; report download failures instead of silently substituting a synth.
- Verify: variation tests, source pitch checks, asset checks, production build, browser audition, then push preview.

## Completed checkpoints
- 89dc458: generator-based takes, persistent locks, role-specific song development, evolving repeats and transitions.
- 8c44255: real recorded piano/marimba assets, provenance, source labels and actionable load errors.
- Final verification: 189 tests pass; production build passes; three existing lint warnings only. All 23 source roots checked (largest measured deviation 17 cents); WAV data has headroom and silent edges. Browser verified piano/marimba loads and playback, evolving repeats, bass lock and final-repeat fills without changing duration. Physical phone audio quality remains a listening check.
