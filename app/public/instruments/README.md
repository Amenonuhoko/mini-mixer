# Recorded acoustic instruments

Piano: Steinway B NoSus, velocity layer 3 (13 roots, four semitones apart). Marimba: Outrigger medium strikes (10 roots). Source: Versilian Community Sample Library, https://github.com/sgossner/VCSL, CC0 1.0 Universal. Full license included.

Exact upstream paths and revision, MIDI roots and durations are in sources.json. Compact derivatives are mono 44.1 kHz / 16-bit PCM, trimmed to at most 5 seconds (piano) or 3.5 seconds (marimba), with edge fades and peak normalization. No runtime codec or synthesis cost is added. Only nearest zones are fetched on instrument selection.

Rebuild with scripts/prepare_instruments.py and the original sources listed in sources.json. Marimba filenames use C3 for middle C; piano filenames use C4. Mappings were checked against the audio spectra.
