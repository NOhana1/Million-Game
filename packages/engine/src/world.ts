// The price world. Every number comes from a noise source keyed by name and time, so the same
// secret always gives the same history, however the clock moves. Only + - * / and sqrt are used,
// because those give identical results on every device.

import { isMarketOpen, type Market } from './calendar.ts';
import { FX_SCALE, type FxRate, type Price } from './money.ts';
import { FUND_SECTOR, SECURITIES } from './securities.ts';

/** Changing how prices are generated rewrites history, so it needs a new version. */
export const WORLD_VERSION = 1;
export const WORLD_START = Date.UTC(2026, 10, 9, 7, 45); // Mon 9 Nov 2026, 09:45 Israel
export const STEP_MS = 5 * 60 * 1000;

/** Eight random 32-bit whole numbers for a key. The same key must always give the same words. */
export type Noise = (key: string) => readonly number[];

export type WorldState = { at: number; fx: FxRate; prices: Record<string, Price> };

const START_FX: FxRate = 3.42 * FX_SCALE;
const WORD_RANGE = 2 ** 32;

// How much of a security's move comes from each source. Their squares add up to about 1.
const MARKET_SHARE = 0.7;
const SECTOR_SHARE = 0.45;
const OWN_SHARE = 0.55;

// Five minute steps in a full session, so that a day's steps add up to one daily move.
const STEPS_PER_DAY: Record<Market, number> = { TASE: 90, US: 78 };
const OPENING_GAP_SCALE = 0.5; // the overnight move, as a share of a daily move

// Rare company news: a few times a year per security, worth 2 to 5 of its daily moves.
const JUMP_CHANCE = 0.0002;
const JUMP_MIN = 2;
const JUMP_EXTRA = 3;

const MARKET_DAILY_VOL = 0.008;
const FX_STEP_VOL = 0.0003;
const FX_TASE_LINK = 0.25; // the dollar tends to rise when Tel Aviv falls

/** A bell-curve number with a typical size of 1, from the first six noise words. */
export function normalFrom(words: readonly number[]): number {
  const sum = words.slice(0, 6).reduce((total, word) => total + word / WORD_RANGE, 0);
  return (sum - 3) * Math.SQRT2;
}

function jumpFrom(words: readonly number[], dailyVol: number): number {
  if ((words[6] ?? 0) / WORD_RANGE >= JUMP_CHANCE) return 0;
  const draw = (words[7] ?? 0) / WORD_RANGE; // the lower half falls, the upper half rises
  const size = dailyVol * (JUMP_MIN + JUMP_EXTRA * ((draw * 2) % 1));
  return draw < 0.5 ? -size : size;
}

/** How big a step is for a market: a session step, an opening gap, or nothing if closed. */
function stepScale(market: Market, wasOpen: boolean, nowOpen: boolean): number {
  if (wasOpen) return 1 / Math.sqrt(STEPS_PER_DAY[market]);
  return nowOpen ? OPENING_GAP_SCALE : 0;
}

const key = (kind: string, name: string, at: number) => `${WORLD_VERSION}|${kind}|${name}|${at}`;

function nextState(state: WorldState, noise: Noise): WorldState {
  const from = state.at;
  const to = from + STEP_MS;
  const wasOpen = { TASE: isMarketOpen('TASE', from), US: isMarketOpen('US', from) };
  const scales = {
    TASE: stepScale('TASE', wasOpen.TASE, isMarketOpen('TASE', to)),
    US: stepScale('US', wasOpen.US, isMarketOpen('US', to)),
  };
  if (scales.TASE === 0 && scales.US === 0) return { ...state, at: to };

  const marketMove = {
    TASE: normalFrom(noise(key('market', 'TASE', to))),
    US: normalFrom(noise(key('market', 'US', to))),
  };
  const sectorMoves = new Map<string, number>();
  const sectorMove = (sector: string) => {
    const known = sectorMoves.get(sector);
    if (known !== undefined) return known;
    const move = normalFrom(noise(key('sector', sector, to)));
    sectorMoves.set(sector, move);
    return move;
  };

  const prices = { ...state.prices };
  for (const security of SECURITIES) {
    const scale = scales[security.market];
    if (scale === 0) continue;
    const words = noise(key('security', security.id, to));
    const common =
      MARKET_SHARE * marketMove[security.market] +
      SECTOR_SHARE * sectorMove(security.sector) +
      OWN_SHARE * normalFrom(words);
    const news = security.sector === FUND_SECTOR ? 0 : jumpFrom(words, security.dailyVol);
    const change = security.dailyVol * scale * common + news;
    const moved = (prices[security.id] ?? security.startPrice) * (1 + change);
    prices[security.id] = Math.max(1, Math.round(moved));
  }

  // The dollar only moves while a market is trading, so it stays frozen over the weekend.
  const trading = wasOpen.TASE || wasOpen.US;
  const taseMove = wasOpen.TASE ? MARKET_DAILY_VOL * scales.TASE * marketMove.TASE : 0;
  const fxMove = FX_STEP_VOL * normalFrom(noise(key('fx', 'USDILS', to))) - FX_TASE_LINK * taseMove;
  const fx = trading ? Math.max(1, Math.round(state.fx * (1 + fxMove))) : state.fx;

  return { at: to, fx, prices };
}

export type World = {
  stateAt(ms: number): WorldState;
  priceAt(securityId: string, ms: number): Price;
  usdIlsAt(ms: number): FxRate;
  /** The price steps after `from`, up to and including `to`, skipping steps with no trading. */
  stepsBetween(from: number, to: number): WorldState[];
};

/**
 * Answers for any time, including the future, so callers must never pass a time later than the
 * world clock. Steps are worked out once and kept, so asking again costs nothing.
 */
export function createWorld(noise: Noise): World {
  const prices = Object.fromEntries(SECURITIES.map((s) => [s.id, s.startPrice]));
  const states: WorldState[] = [{ at: WORLD_START, fx: START_FX, prices }];

  const indexFor = (ms: number) => Math.max(0, Math.floor((ms - WORLD_START) / STEP_MS));

  function stateAtIndex(index: number): WorldState {
    let last = states[states.length - 1] as WorldState;
    while (states.length <= index) {
      last = nextState(last, noise);
      states.push(last);
    }
    return states[index] as WorldState;
  }

  const stateAt = (ms: number) => stateAtIndex(indexFor(ms));

  return {
    stateAt,
    priceAt(securityId, ms) {
      const price = stateAt(ms).prices[securityId];
      if (price === undefined) throw new Error(`Unknown security ${securityId}`);
      return price;
    },
    usdIlsAt: (ms) => stateAt(ms).fx,
    stepsBetween(from, to) {
      const steps: WorldState[] = [];
      for (let index = indexFor(from) + 1; index <= indexFor(to); index += 1) {
        const state = stateAtIndex(index);
        const previous = stateAtIndex(index - 1);
        if (state.prices !== previous.prices) steps.push(state);
      }
      return steps;
    },
  };
}
