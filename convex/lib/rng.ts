/**
 * Deterministic shuffling for the exam paper (LLD §7.3, PRD EX-10).
 *
 * The option order is never stored: it is recomputed from
 * `questionSeed(attempt.shuffleSeed, question._id)` for both the paper and the
 * review, so these functions must stay stable across releases. Changing any of
 * them reorders options in existing attempts' reviews.
 */

/** mulberry32: a small, fast 32-bit PRNG. Returns floats in [0, 1). */
export function rng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates shuffle driven by `rng(seed)`. Returns a new array. */
export function shuffled<T>(items: readonly T[], seed: number): T[] {
  const out = items.slice();
  const next = rng(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    const tmp = out[i] as T;
    out[i] = out[j] as T;
    out[j] = tmp;
  }
  return out;
}

/** 32-bit FNV-1a over the string's UTF-16 code units (ids are ASCII). */
export function fnv1a32(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Per-question seed: the attempt's seed mixed with the question id (uint32). */
export function questionSeed(attemptSeed: number, questionId: string): number {
  return (attemptSeed ^ fnv1a32(questionId)) >>> 0;
}
