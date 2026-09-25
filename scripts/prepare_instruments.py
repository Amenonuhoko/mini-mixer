"""Prepare the small CC0 VCSL subset. Usage: python scripts/prepare_instruments.py SOURCE_DIR.
Needs numpy; reads sources.json plus the downloaded WAVs. No network access.
"""
import json, sys, wave
from pathlib import Path
import numpy as np
source = Path(sys.argv[1])
out = Path(__file__).resolve().parent.parent / 'app/public/instruments'
manifest_path = out / 'sources.json'
manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
new_packs = {}
for item in json.loads((source / 'sources.json').read_text(encoding='utf-8-sig')):
    kind, note = item['kind'], item['note']
    with wave.open(str(source / f'{kind}-{note}.wav'), 'rb') as w:
        rate, channels, width = w.getframerate(), w.getnchannels(), w.getsampwidth()
        raw = w.readframes(w.getnframes())
    if width == 3:
        b = np.frombuffer(raw, np.uint8).reshape(-1, 3).astype(np.int32)
        x = b[:,0] | (b[:,1] << 8) | (b[:,2] << 16)
        x = np.where(x & 0x800000, x - 0x1000000, x) / 8388608
    elif width == 2:
        x = np.frombuffer(raw, '<i2') / 32768
    else:
        raise ValueError(f'Unsupported PCM width: {width}')
    x = x.reshape(-1, channels).mean(axis=1)
    peak = float(np.max(np.abs(x)))
    nonzero = np.flatnonzero(np.abs(x) > peak * .0015)
    start = max(0, int(nonzero[0]) - int(rate * .005))
    duration = {'piano': 5, 'strings': 3, 'clarinet': 1.8, 'flute': 1.8, 'trumpet': 1.6, 'sax': 1.8}.get(kind, 3.5)
    release_seconds = .35 if kind == 'strings' else .18 if kind in ('clarinet', 'flute', 'trumpet', 'sax') else .08
    stop = min(len(x), int(nonzero[-1]) + int(rate * .08), start + int(rate * duration))
    x = x[start:stop].copy()
    x -= np.mean(x)
    attack, release = min(len(x), int(rate * .001)), min(len(x), int(rate * release_seconds))
    x[:attack] *= np.linspace(0, 1, attack)
    x[-release:] *= np.linspace(1, 0, release)
    x *= .75 / max(float(np.max(np.abs(x))), .001)
    pitch = {'C':0, 'D':2, 'E':4, 'F':5, 'G':7, 'A':9, 'B':11}[note[0]] + ('#' in note)
    # VCSL marimba labels use C3 = middle C; Steinway labels use C4 = middle C.
    midi = item.get('midi', (int(note[-1]) + (2 if kind == 'marimba' else 1)) * 12 + pitch)
    if rate != 44100:
        raise ValueError(f'{kind}-{note}: expected 44100 Hz source, got {rate}')
    file = f'{kind}-{midi}.wav'
    with wave.open(str(out / file), 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate)
        w.writeframes(np.round(x * 32767).astype('<i2').tobytes())
    item.update(midi=midi, file=file, seconds=round(len(x)/rate,3))
    new_packs.setdefault(kind, []).append(item)
manifest.update(new_packs)
(out / 'sources.json').write_text(json.dumps(manifest, indent=2)+'\n')
for license_file in source.glob('LICENSE*'):
    name = 'LICENSE-VCSL.txt' if license_file.name == 'LICENSE' else license_file.name
    (out / name).write_bytes(license_file.read_bytes())
zones = {kind: sorted([dict(midi=i['midi'], file=i['file']) for i in items], key=lambda i: i['midi']) for kind, items in manifest.items()}
(out.parent.parent / 'src/engine/recordedKeys.ts').write_text(
    '/** Compact CC0 recordings. See public/instruments/sources.json for provenance. */\n'
    + 'export const RECORDED_KEYS = ' + json.dumps(zones, indent=2) + ' as const\n')
print('Prepared', sum(map(len, manifest.values())), 'zones;', round(sum(p.stat().st_size for p in out.glob('*.wav'))/1e6,2), 'MB')
