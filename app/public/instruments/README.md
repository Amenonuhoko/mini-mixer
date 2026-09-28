# Recorded acoustic instruments

All recordings are CC0 1.0 Universal. Full licenses are included.

| Preset | Recording | Roots | Source |
| --- | --- | ---: | --- |
| Piano | Steinway B NoSus, velocity 3 | 13 | VCSL |
| Harpsichord | French harpsichord, main manual | 9 | VCSL |
| Marimba | Outrigger medium strikes | 10 | VCSL |
| Vibraphone | Soft mallets, firmer strike layer | 10 | VCSL |
| Glockenspiel | Medium strikes | 6 | VCSL |
| Kalimba | Tanzanian kalimba, plucked | 10 | VCSL |
| Pluck | Concert harp, mezzo forte | 10 | VCSL |
| Bell | Tubular bells, soft strikes | 9 | VCSL |
| Pipe Organ | Quiet manual, single pipes | 9 | VCSL |
| Harmonica | Hohner Super 64 chromatic, normal sustains | 11 | VCSL |
| Velvet Strings | Violin section, bowed with vibrato | 11 | VSCO 2 CE |
| Cello | Cello section, bowed with vibrato, soft layer | 10 | VSCO 2 CE |
| Pizzicato Strings | Cello section (C2–D3) and violin section (G3 up), plucked | 13 | VSCO 2 CE |
| Upright Bass | Solo contrabass, pizzicato | 10 | VSCO 2 CE |
| Clarinet | DC clarinet, medium sustained notes | 11 | VSCO 2 CE |
| Flute | LD flute, sustained with vibrato | 10 | VSCO 2 CE |
| Oboe | Oboe, sustained with vibrato, forte | 9 | VSCO 2 CE |
| Bassoon | PS bassoon, sustained, medium layer | 10 | VSCO 2 CE |
| Trumpet | SH open trumpet, forte sustained notes | 10 | VSCO 2 CE |
| French Horn | MO horn, sustained, medium layer | 10 | VSCO 2 CE |
| Trombone | Tenor trombone, sustained, medium layer | 9 | VSCO 2 CE |
| Alto Saxophone | Weresax alto, forte condenser recordings | 11 | Weresax |
| Guitar | Black and Green electric guitar | 7 | Karoryfer / MAESTRO String Studio repack |
| Bass | Growlybass fingered bass | 7 | Karoryfer / MAESTRO String Studio repack |

Sources: [VCSL](https://github.com/sgossner/VCSL), [VSCO 2 CE](https://github.com/sgossner/VSCO-2-CE) (Sam Gossner and Simon Dalzell), [Weresax](https://github.com/sfzinstruments/karoryfer.weresax) (Karoryfer).

Guitar/bass repacks: [electric guitar](https://huggingface.co/AEmotionStudio/stringstudio-electric-guitar-samples), [bass](https://huggingface.co/AEmotionStudio/stringstudio-bass-samples). Both manifests declare CC0; original libraries are Karoryfer Black and Green Guitars and Growlybass. Exact download URLs and source SHA-256 hashes are retained in sources.json. Their 48 kHz originals (and VCSL's 48 kHz harpsichord and kalimba) are resampled with Fourier low-pass resampling to 44.1 kHz.

Exact upstream paths and revisions, MIDI roots, durations and tuning offsets are in sources.json. Compact derivatives are mono 44.1 kHz / 16-bit PCM with edge fades and peak normalization. Maximum durations: piano 5 seconds; marimba, harp, bells and vibraphone 3.5; harpsichord, glockenspiel, strings and cello 3; kalimba, pipe organ and upright bass 2.5; pizzicato 2; winds 1.8 (trumpet 1.6). Wind attacks are retained, with a 180 ms release; strings, cello and pipe organ use 350 ms, harpsichord and glockenspiel 400 ms, vibraphone 500 ms, kalimba and upright bass 300 ms, pizzicato 200 ms. These are finite one-shots, not an expressive legato or velocity-layer instrument. Only nearest zones are fetched on instrument selection; the entire library is not loaded at startup. Source-buffer caching is limited to 24 zones.

## Tuning

Every zone's sounding pitch is measured from the finished audio (`measure_cents` in scripts/prepare_instruments.py: the interpolated FFT peak at the fundamental, or the median over the first three harmonics for harmonic tones, preferring the upper harmonics below MIDI 50 where the bin is coarse) and stored as `cents` in sources.json and src/engine/recordedKeys.ts; offsets under 3 cents are dropped. The renderer cancels the offset when it pitches a zone (`zoneShiftSemitones`), so notes built from different zones agree with each other and with the synth voices. 91 of the 235 zones carry an offset. The largest belong to the kalimba (up to 62 cents: its tines are tuned to their own scale, and each is retuned to its note), the glockenspiel (8–24 cents sharp, as glockenspiels are), the upright bass (up to 24 cents) and the harp (5–13 cents flat). Marimba, vibraphone, glockenspiel and kalimba are measured on the fundamental only, since their overtones are inharmonic. Tubular bells are not measured: a chime's perceived strike note is not a spectral peak. Re-measure with `python scripts/prepare_instruments.py --retune`.

## Roots and registers

Piano/harp use scientific octave labels (C4 = middle C); marimba, bells, strings, winds and every pack added in the second expansion (harpsichord, vibraphone, glockenspiel, kalimba, pipe organ, harmonica, cello, pizzicato, contrabass, horn, trombone, oboe, bassoon) label middle C as C3. The clarinet file labelled F#5 actually sounds F6 (MIDI 89). Mappings were checked against audio spectra; a regression test measures every wind and string zone (fundamental present, in tune after its offset, and no octave underneath). Do not infer MIDI roots from filenames alone.

The former third-party flute/clarinet/trumpet manifests labelled their notes an octave below the recordings, causing incorrect register selection and playback an octave high. These packs now use measured roots and bundled originals rather than those manifests. The selected guitar/bass repack filenames have the opposite octave convention: the sounding root is 12 semitones below the filename. An inconsistent legacy bass file (52_v100_rr1.wav) was replaced with verified current-pack zones.

The glockenspiel pack spans G5–C8 (MIDI 79–108), so the Glockenspiel preset renders each pad an octave above its written note (`octaveShift`), as a real glockenspiel sounds above its part. Two pipe-organ zones (C2 and F#2 of the quiet manual, recorded near −53 dBFS) were left out for their noise floor; the bank's lowest notes pitch the C3 pipe down instead. Layers: oboe forte; horn, trombone and bassoon medium; cello section soft, to match the violins; contrabass forte for E1–A#1 (the soft layer there is quiet and short) and soft above.

The complete 235-zone library is 50.66 MB; no instrument fetches a remote manifest or requires a third-party sample host at runtime. Existing saved banks contain rendered audio: reselect an instrument to rebuild it with the current tuning.

## Rebuilding

Rebuild with scripts/prepare_instruments.py (needs numpy) and downloaded original sources: save each as KIND-NOTE.wav alongside a sources.json array of the corresponding provenance entries (kind, note, path, revision, repository; `midi` when the label convention does not apply). Rebuilding a subset preserves the other packs, and every run re-measures tuning for all of them.
