// Noise for the browser preview only. It isn't secret or secure: a real game must use
// secureNoise on the server, so that nobody can work out future prices.

import type { Noise } from '@portfolio-league/engine';

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

function nextWord(state: number): [number, number] {
  const next = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(next ^ (next >>> 15), 1 | next);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return [(t ^ (t >>> 14)) >>> 0, next];
}

export const demoNoise: Noise = (key) => {
  let state = hash(key);
  return Array.from({ length: 8 }, () => {
    const [word, next] = nextWord(state);
    state = next;
    return word;
  });
};
