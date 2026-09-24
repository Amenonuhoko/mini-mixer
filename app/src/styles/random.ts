/** A small, fast, seedable PRNG (mulberry32) — the same seed always writes the same beat. */
export function createRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Mixes numbers and strings into one 32-bit seed, so each layer gets its own stream from the beat's seed. */
export function mixSeed(...parts: Array<number | string>): number {
  let h = 2166136261
  for (const part of parts) {
    const text = String(part)
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i)
      h = Math.imul(h, 16777619)
    }
    h ^= 0xff
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function newSeed(): number {
  return Math.floor(Math.random() * 2 ** 32)
}

export function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)]!
}

/** Picks a key from `weights` in proportion to its weight. */
export function weighted<K extends string>(rng: () => number, weights: Record<K, number>): K {
  const entries = Object.entries(weights) as Array<[K, number]>
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0)
  let roll = rng() * total
  for (const [key, weight] of entries) {
    roll -= weight
    if (roll <= 0) return key
  }
  return entries[entries.length - 1]![0]
}
