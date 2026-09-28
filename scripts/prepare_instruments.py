"""Prepare the compact CC0 recorded-instrument packs.

Usage:
  python scripts/prepare_instruments.py SOURCE_DIR   # build packs from downloaded originals
  python scripts/prepare_instruments.py --retune     # only re-measure tuning of the packs already built

SOURCE_DIR holds KIND-NOTE.wav files plus a sources.json array of provenance
entries (kind, note, path, revision/repository or sourceUrl, optional midi).
Needs numpy; no network access. Rebuilding a subset preserves the other packs.

Every zone's sounding pitch is measured from the finished audio and stored as a
cents offset from equal temperament (see measure_cents); the app cancels it when
it pitches a zone, so notes built from different zones agree with each other.
"""
import json, sys, wave
from pathlib import Path
import numpy as np

out = Path(__file__).resolve().parent.parent / 'app/public/instruments'
manifest_path = out / 'sources.json'

# Seconds kept per note and the fade applied at the cut (or natural) end.
DURATION = {'piano': 5, 'strings': 3, 'cello': 3, 'clarinet': 1.8, 'flute': 1.8, 'trumpet': 1.6, 'sax': 1.8, 'oboe': 1.8, 'bassoon': 1.8,
            'horn': 1.8, 'trombone': 1.8, 'harmonica': 1.8, 'harpsichord': 3, 'vibraphone': 3.5, 'glockenspiel': 3, 'kalimba': 2.5,
            'pipeorgan': 2.5, 'pizzicato': 2, 'upright': 2.5}
RELEASE = {'strings': .35, 'cello': .35, 'pipeorgan': .35, 'harpsichord': .4, 'glockenspiel': .4, 'vibraphone': .5, 'kalimba': .3, 'upright': .3, 'pizzicato': .2}
WINDS = {'clarinet', 'flute', 'trumpet', 'sax', 'oboe', 'bassoon', 'horn', 'trombone', 'harmonica'}
# Sustained tones are measured after their attack settles; struck and plucked ones right after the strike.
SUSTAINED = WINDS | {'strings', 'cello', 'pipeorgan'}
# Bar and tine instruments have inharmonic overtones: only the fundamental names the pitch.
BAR_KINDS = {'glockenspiel', 'vibraphone', 'marimba', 'kalimba'}
# A chime's perceived (strike) pitch is not a spectral peak, so tubular bells are left as recorded.
UNMEASURED = {'bell'}
# Label conventions differ per library: these packs label middle C as C3, the others as C4.
MIDDLE_C_IS_C3 = {'marimba', 'harpsichord', 'vibraphone', 'glockenspiel', 'kalimba', 'pipeorgan', 'harmonica', 'cello', 'pizzicato',
                  'upright', 'horn', 'trombone', 'oboe', 'bassoon'}


def read_wav(path):
    with wave.open(str(path), 'rb') as w:
        rate, channels, width = w.getframerate(), w.getnchannels(), w.getsampwidth()
        raw = w.readframes(w.getnframes())
    if width == 3:
        b = np.frombuffer(raw, np.uint8).reshape(-1, 3).astype(np.int32)
        x = b[:, 0] | (b[:, 1] << 8) | (b[:, 2] << 16)
        x = np.where(x & 0x800000, x - 0x1000000, x) / 8388608
    elif width == 2:
        x = np.frombuffer(raw, '<i2') / 32768
    else:
        raise ValueError(f'Unsupported PCM width: {width}')
    return rate, x.reshape(-1, channels).mean(axis=1)


def peak_near(freqs, mag, hz, cents):
    """Interpolated peak frequency and magnitude within +-cents of hz."""
    idx = np.where((freqs >= hz * 2 ** (-cents / 1200)) & (freqs <= hz * 2 ** (cents / 1200)))[0]
    if len(idx) == 0: return None, 0
    k = idx[np.argmax(mag[idx])]
    shift = 0
    if 0 < k < len(mag) - 1:
        a, b, c = (np.log(mag[i] + 1e-12) for i in (k - 1, k, k + 1))
        if a - 2 * b + c != 0: shift = max(-.5, min(.5, .5 * (a - c) / (a - 2 * b + c)))
    return freqs[k] + shift * (freqs[1] - freqs[0]), mag[k]


def measure_cents(x, rate, kind, midi):
    """Sounding pitch of a zone, in cents from its nominal note; 0 when it is within 3 cents or cannot be measured."""
    if kind in UNMEASURED: return 0
    peak = float(np.max(np.abs(x)))
    onset = int(np.flatnonzero(np.abs(x) > peak * .015)[0])
    sustained = kind in SUSTAINED
    n = 65536 if sustained else 32768
    start = onset + int(rate * (.15 if sustained else .03))
    segment = x[start:start + n]
    segment = np.pad(segment, (0, n - len(segment))) * np.hanning(n)
    mag = np.abs(np.fft.rfft(segment))
    freqs = np.fft.rfftfreq(n, 1 / rate)
    floor = float(np.median(mag)) + 1e-9
    hz = 440 * 2 ** ((midi - 69) / 12)
    estimates = []
    for h in ((1,) if kind in BAR_KINDS else (1, 2, 3)):
        f, a = peak_near(freqs, mag, hz * h, 90 if kind == 'kalimba' else 60)
        if f is not None and a > 8 * floor: estimates.append((h, 1200 * np.log2(f / h / hz)))
    if not estimates: return 0
    # Low notes: the FFT bin is coarse at the fundamental, so trust the upper harmonics when both are clear.
    upper = [c for h, c in estimates if h > 1]
    cents = float(np.median(upper if midi < 50 and len(upper) == 2 else [c for _, c in estimates]))
    return 0 if abs(cents) < 3 else int(round(cents))


def note_midi(kind, note):
    pitch = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}[note[0]] + ('#' in note)
    return (int(note[-1]) + (2 if kind in MIDDLE_C_IS_C3 else 1)) * 12 + pitch


def prepare(source, manifest):
    new_packs = {}
    for item in json.loads((source / 'sources.json').read_text(encoding='utf-8-sig')):
        kind, note = item['kind'], item['note']
        rate, x = read_wav(source / f'{kind}-{note}.wav')
        peak = float(np.max(np.abs(x)))
        nonzero = np.flatnonzero(np.abs(x) > peak * .0015)
        start = max(0, int(nonzero[0]) - int(rate * .005))
        duration = DURATION.get(kind, 3.5)
        release_seconds = RELEASE.get(kind, .18 if kind in WINDS else .08)
        stop = min(len(x), int(nonzero[-1]) + int(rate * .08), start + int(rate * duration))
        x = x[start:stop].copy()
        x -= np.mean(x)
        if rate != 44100:
            # Fourier resampling removes frequencies above the destination Nyquist
            # rather than folding them into the audible range during downsampling.
            count = round(len(x) * 44100 / rate)
            spectrum = np.fft.rfft(x)
            if count < len(x) and count % 2 == 0:
                spectrum[count // 2] *= 2
            x = np.fft.irfft(spectrum, n=count) * count / len(x)
            rate = 44100
        attack, release = min(len(x), int(rate * .001)), min(len(x), int(rate * release_seconds))
        x[:attack] *= np.linspace(0, 1, attack)
        x[-release:] *= np.linspace(1, 0, release)
        x *= .75 / max(float(np.max(np.abs(x))), .001)
        midi = item.get('midi', note_midi(kind, note))
        file = f'{kind}-{midi}.wav'
        with wave.open(str(out / file), 'wb') as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate)
            w.writeframes(np.round(x * 32767).astype('<i2').tobytes())
        item.update(midi=midi, file=file, seconds=round(len(x) / rate, 3))
        new_packs.setdefault(kind, []).append(item)
    manifest.update(new_packs)
    for license_file in source.glob('LICENSE*'):
        name = 'LICENSE-VCSL.txt' if license_file.name == 'LICENSE' else license_file.name
        (out / name).write_bytes(license_file.read_bytes())


def retune(manifest):
    for kind, items in manifest.items():
        for item in items:
            rate, x = read_wav(out / item['file'])
            item['cents'] = measure_cents(x, rate, kind, item['midi'])


def write(manifest):
    manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
    zones = {}
    for kind, items in manifest.items():
        zones[kind] = [dict(midi=i['midi'], file=i['file'], **({'cents': i['cents']} if i.get('cents') else {})) for i in sorted(items, key=lambda i: i['midi'])]
    (out.parent.parent / 'src/engine/recordedKeys.ts').write_text(
        '/** Compact CC0 recordings. See public/instruments/sources.json for provenance. `cents` is the measured tuning offset the renderer cancels. */\n'
        + 'export const RECORDED_KEYS = ' + json.dumps(zones, indent=2) + ' as const\n')


if __name__ == '__main__':
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    if sys.argv[1] != '--retune':
        prepare(Path(sys.argv[1]), manifest)
    retune(manifest)
    write(manifest)
    tuned = [i for items in manifest.values() for i in items if i.get('cents')]
    print('Prepared', sum(map(len, manifest.values())), 'zones;', round(sum(p.stat().st_size for p in out.glob('*.wav')) / 1e6, 2), 'MB;',
          len(tuned), 'zones carry a tuning offset (largest', max((abs(i['cents']) for i in tuned), default=0), 'cents)')
