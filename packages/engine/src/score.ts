// Rule 6: score = 0.85 x return rank + 0.15 x stability rank.

import { type Agorot, partsPerMillion } from './money.ts';

export const RETURN_WEIGHT = 85;
export const STABILITY_WEIGHT = 15;

export type Drawdown = { peak: Agorot; maxFallPpm: number };

export const newDrawdown = (value: Agorot): Drawdown => ({ peak: value, maxFallPpm: 0 });

/** Records a new portfolio value. Largest fall from a peak to a later trough. */
export function trackDrawdown(drawdown: Drawdown, value: Agorot): Drawdown {
  const peak = Math.max(drawdown.peak, value);
  const fall = peak === 0 ? 0 : partsPerMillion(peak - value, peak);
  return { peak, maxFallPpm: Math.max(drawdown.maxFallPpm, fall) };
}

export const returnPpm = (start: Agorot, value: Agorot) =>
  start === 0 ? 0 : partsPerMillion(value - start, start);

/** Percentile from 0 to 100, where 100 is the highest. Ties share the average. */
export function percentile(values: readonly number[], value: number): number {
  if (values.length < 2) return 100;
  const below = values.filter((v) => v < value).length;
  const ties = values.filter((v) => v === value).length - 1;
  return (100 * (below + ties / 2)) / (values.length - 1);
}

export type Contestant = { id: string; returnPpm: number; maxFallPpm: number };
export type Ranked = Contestant & { returnRank: number; stabilityRank: number; score: number };

/** Sorted best first. Ties go to higher return, then smaller fall, then id. */
export function rankPlayers(players: readonly Contestant[]): Ranked[] {
  const returns = players.map((p) => p.returnPpm);
  const calmness = players.map((p) => -p.maxFallPpm);
  return players
    .map((p) => {
      const returnRank = percentile(returns, p.returnPpm);
      const stabilityRank = percentile(calmness, -p.maxFallPpm);
      const score = (RETURN_WEIGHT * returnRank + STABILITY_WEIGHT * stabilityRank) / 100;
      return { ...p, returnRank, stabilityRank, score };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.returnPpm - a.returnPpm ||
        a.maxFallPpm - b.maxFallPpm ||
        a.id.localeCompare(b.id),
    );
}
