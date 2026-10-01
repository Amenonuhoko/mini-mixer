# Drum kit recordings

Virtuosity Drums, CC0 1.0 Universal (full text in LICENSE-CC0.txt), as
prepared by ferrosintesis — https://github.com/0x4D44/ferrosintesis,
`crates/ferrosintesis-samples-drumkit` (`core/`: kick, snare, side stick,
toms, hi-hats, ride) and `crates/ferrosintesis-samples-drumkit2`
(`cymbals/`: crash, splash, china). Mono 16-bit 44.1 kHz FLAC, copied
unchanged; see that repository's PROVENANCE.md for the source revision and
processing chain.

Only the files the kits in `src/engine/drumSynth.ts` name are here. The app
used to fetch them from GitHub at build time of a kit; serving them itself
means one origin, caching like the rest of the app, and nothing a phone has
to reach a third party for.
