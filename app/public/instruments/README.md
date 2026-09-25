# Recorded acoustic instruments

All recordings are CC0 1.0 Universal. Full licenses are included.

| Preset | Recording | Roots | Source |
| --- | --- | ---: | --- |
| Piano | Steinway B NoSus, velocity 3 | 13 | VCSL |
| Marimba | Outrigger medium strikes | 10 | VCSL |
| Pluck | Concert harp, mezzo forte | 10 | VCSL |
| Bell | Tubular bells, soft strikes | 9 | VCSL |
| Velvet Strings | Violin section, bowed with vibrato | 11 | VSCO 2 CE |
| Clarinet | DC clarinet, medium sustained notes | 11 | VSCO 2 CE |
| Flute | LD flute, sustained with vibrato | 10 | VSCO 2 CE |
| Trumpet | SH open trumpet, forte sustained notes | 10 | VSCO 2 CE |
| Alto Saxophone | Weresax alto, forte condenser recordings | 11 | Weresax |
| Guitar | Black and Green electric guitar | 7 | Karoryfer / MAESTRO String Studio repack |
| Bass | Growlybass fingered bass | 7 | Karoryfer / MAESTRO String Studio repack |

Sources: [VCSL](https://github.com/sgossner/VCSL), [VSCO 2 CE](https://github.com/sgossner/VSCO-2-CE) (Sam Gossner and Simon Dalzell), [Weresax](https://github.com/sfzinstruments/karoryfer.weresax) (Karoryfer).

Guitar/bass repacks: [electric guitar](https://huggingface.co/AEmotionStudio/stringstudio-electric-guitar-samples), [bass](https://huggingface.co/AEmotionStudio/stringstudio-bass-samples). Both manifests declare CC0; original libraries are Karoryfer Black and Green Guitars and Growlybass. Exact download URLs and source SHA-256 hashes are retained in sources.json. Their 48 kHz originals are resampled with Fourier low-pass resampling to 44.1 kHz.

Exact upstream paths and revisions, MIDI roots and durations are in sources.json. Compact derivatives are mono 44.1 kHz / 16-bit PCM with edge fades and peak normalization. Maximum durations: piano 5 seconds, marimba/harp/bells 3.5 seconds, strings 3 seconds, winds 1.8 seconds (trumpet 1.6). Wind attacks are retained, with a 180 ms release; strings use a 350 ms release. These are finite one-shots, not an expressive legato or velocity-layer instrument. Only nearest zones are fetched on instrument selection; the entire library is not loaded at startup. Source-buffer caching is limited to 24 zones.

Rebuild with scripts/prepare_instruments.py and downloaded original sources: save each as KIND-NOTE.wav alongside a sources.json array of the corresponding provenance entries. Rebuilding a subset preserves the other packs. Piano/harp use scientific octave labels; marimba, bells, strings and winds use C3 for middle C. The clarinet file labelled F#5 actually sounds F6 (MIDI 89). Mappings were checked against audio spectra; wind roots are also guarded by an autocorrelation regression test. Do not infer MIDI roots from filenames alone.

The former third-party flute/clarinet/trumpet manifests labelled their notes an octave below the recordings, causing incorrect register selection and playback an octave high. These packs now use measured roots and bundled originals rather than those manifests. Existing saved banks contain rendered audio: reselect the instrument to rebuild them.

The selected guitar/bass repack filenames have the opposite octave convention: the sounding root is 12 semitones below the filename. An inconsistent legacy bass file (52_v100_rr1.wav) was replaced with verified current-pack zones. Wind, guitar and bass roots (56 recordings) all pass the pitch regression test. The complete 109-zone library is 26.25 MB; no instrument fetches a remote manifest or requires a third-party sample host at runtime.
