# Guided song and variation work

## Checkpoints
- [x] Guided structures, linked-pattern explanation, make unique, clear editing context.
- [x] Variations with locked banks, Keep/Undo, related verse/chorus patterns and transitions.
- [x] Focused tests, build and browser checks.
- [x] Push final checkpoint to preview (8812706).

Reuse current instruments and sample IDs. Preserve existing preview layout and mobile audio fixes. Commit each checkpoint so work can resume safely.

Checkpoint 1: 3d9c7c1. Checkpoint 2 implements exact sample-preserving variations, locks, global Keep/Undo, related parts and independent final-repeat transitions. Focused tests passing; final browser/production verification next.

Checkpoint 2: ede0341. Final verification: 183 tests passed; build passed; lint has only three pre-existing Fast Refresh warnings. Phone-sized browser verified related song Keep/Undo, final-repeat isolation and looped fill audition. Undo retains editing scope.
