// FAKE GAME running in the browser, so we can judge the screens before the backend exists.
// The rules come from the engine. Only the fake prices, fake rivals and the clock speed live here.
// Reloading the page resets everything.

import {
  type Account,
  AGOROT_PER_SHEKEL,
  type Drawdown,
  FX_SCALE,
  holdingValue as engineHoldingValue,
  maxOrderAmount as engineMaxOrderAmount,
  newAccount,
  newDrawdown,
  type Order,
  orderProblem as engineOrderProblem,
  type OrderProblem,
  placeOrder,
  portfolioValue as enginePortfolioValue,
  PPM_SCALE,
  PRICE_SCALE,
  quoteFor,
  type QuoteSource,
  rankPlayers,
  reservedCash as engineReservedCash,
  returnPpm,
  settleDueOrders,
  shekelsToAgorot,
  type Side,
  START_CASH,
  trackDrawdown,
  UNIT_SCALE,
} from '@portfolio-league/engine';

import { isMarketOpen, nextMarketEvent, SECURITIES, SECURITY_BY_ID, Security } from './world';

export type { Order, Side };

export const START_SHEKELS = START_CASH / AGOROT_PER_SHEKEL;
const WORLD_START = Date.UTC(2026, 10, 9, 7, 45); // Mon 9 Nov 2026, 09:45 Israel
export const WORLD_MS_PER_TICK = 5 * 60 * 1000; // one real second = five world minutes
const SESSION_MINUTES = 450;

type Rival = { name: string; vol: number; value: number; drawdown: Drawdown };

export type GameState = {
  player: string | null;
  paused: boolean;
  worldMs: number;
  seed: number;
  fx: number;
  prices: Record<string, number>;
  dayStart: Record<string, number>;
  account: Account;
  drawdown: Drawdown;
  rivals: Rival[];
};

const rival = (name: string, vol: number): Rival => ({
  name,
  vol,
  value: START_CASH,
  drawdown: newDrawdown(START_CASH),
});

const startPrices = Object.fromEntries(
  SECURITIES.map((x) => [x.id, Math.round(x.startPrice * PRICE_SCALE)]),
);

export const initialState: GameState = {
  player: null,
  paused: false,
  worldMs: WORLD_START,
  seed: 20261109,
  fx: 3.42 * FX_SCALE,
  prices: startPrices,
  dayStart: startPrices,
  account: newAccount(),
  drawdown: newDrawdown(START_CASH),
  rivals: [
    rival('Index Holder (bot)', 0.008),
    rival('All-In Gambler (bot)', 0.04),
    rival('Cash Keeper (bot)', 0),
    rival('Tech Chaser (bot)', 0.025),
    rival('Steady Saver (bot)', 0.006),
    rival('Day Trader (bot)', 0.03),
    rival('Dividend Fan (bot)', 0.01),
    rival('Contrarian (bot)', 0.018),
  ],
};

// Small seeded generator, so the reducer stays pure.
function nextRandom(seed: number): [number, number] {
  const next = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(next ^ (next >>> 15), 1 | next);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, next];
}

const quotes =
  (state: GameState): QuoteSource =>
  (id) =>
    quoteFor(SECURITY_BY_ID[id].market, state.prices[id], state.fx);

// What the screens read, in shekels and whole units.
const toShekels = (agorot: number) => agorot / AGOROT_PER_SHEKEL;
export const toUnits = (units: number) => units / UNIT_SCALE;
export const displayPrice = (state: GameState, id: string) => state.prices[id] / PRICE_SCALE;
export const displayFx = (state: GameState) => state.fx / FX_SCALE;
export const cash = (state: GameState) => toShekels(state.account.cash);
export const orderAmount = (order: Order) => toShekels(order.fill?.value ?? order.amount);
export const reservedCash = (state: GameState) => toShekels(engineReservedCash(state.account));
export const portfolioValue = (state: GameState) =>
  toShekels(enginePortfolioValue(state.account, quotes(state)));
export const holdingValue = (state: GameState, id: string) =>
  toShekels(engineHoldingValue(state.account, id, quotes(state)));

export const maxOrderAmount = (state: GameState, security: Security, side: Side) =>
  Math.floor(toShekels(engineMaxOrderAmount(state.account, security.id, side, quotes(state))));

const PROBLEM_TEXT: Partial<Record<OrderProblem, string>> = {
  INVALID_AMOUNT: 'Enter an amount.',
  INSUFFICIENT_HOLDING: 'You can’t sell more than you hold.',
  INSUFFICIENT_CASH: 'You don’t have enough cash.',
  POSITION_LIMIT: 'This would put more than 20% of your portfolio in one security.',
};

export function orderProblem(
  state: GameState,
  security: Security,
  side: Side,
  amount: number,
): string | null {
  const problem = engineOrderProblem(
    state.account,
    security.id,
    side,
    shekelsToAgorot(amount),
    quotes(state),
  );
  return problem && (PROBLEM_TEXT[problem] ?? null);
}

function moveTo(state: GameState, targetMs: number): GameState {
  const minutes = (targetMs - state.worldMs) / 60000;
  const stepScale = Math.sqrt(Math.min(minutes, SESSION_MINUTES) / SESSION_MINUTES);
  const wasOpen = {
    TASE: isMarketOpen('TASE', state.worldMs),
    US: isMarketOpen('US', state.worldMs),
  };
  const nowOpen = { TASE: isMarketOpen('TASE', targetMs), US: isMarketOpen('US', targetMs) };

  let seed = state.seed;
  const noise = () => {
    const [value, next] = nextRandom(seed);
    seed = next;
    return (value - 0.5) * 3.4; // roughly unit variance
  };

  const prices = { ...state.prices };
  const dayStart = { ...state.dayStart };
  for (const security of SECURITIES) {
    if (!wasOpen[security.market]) continue;
    const moved = prices[security.id] * (1 + security.dailyVol * stepScale * noise());
    prices[security.id] = Math.max(1, Math.round(moved));
  }
  for (const security of SECURITIES) {
    if (!wasOpen[security.market] && nowOpen[security.market]) {
      dayStart[security.id] = prices[security.id];
    }
  }

  const anyOpen = wasOpen.TASE || wasOpen.US;
  const fx = anyOpen ? Math.round(state.fx * (1 + 0.004 * stepScale * noise())) : state.fx;
  const rivals = state.rivals.map((r) => {
    const value = anyOpen ? Math.round(r.value * (1 + r.vol * stepScale * noise())) : r.value;
    return { ...r, value, drawdown: trackDrawdown(r.drawdown, value) };
  });

  const next: GameState = { ...state, worldMs: targetMs, seed, prices, dayStart, fx, rivals };
  const current = quotes(next);
  const account = settleDueOrders(next.account, targetMs, (order) => current(order.securityId));
  const value = enginePortfolioValue(account, current);
  return { ...next, account, drawdown: trackDrawdown(next.drawdown, value) };
}

export type Action =
  | { type: 'join'; name: string }
  | { type: 'tick' }
  | { type: 'togglePause' }
  | { type: 'skipToNextEvent' }
  | { type: 'placeOrder'; securityId: string; side: Side; amount: number };

export function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'join':
      return { ...state, player: action.name };
    case 'togglePause':
      return { ...state, paused: !state.paused };
    case 'tick':
      return state.paused || !state.player
        ? state
        : moveTo(state, state.worldMs + WORLD_MS_PER_TICK);
    case 'skipToNextEvent':
      return moveTo(state, nextMarketEvent(state.worldMs));
    case 'placeOrder': {
      const result = placeOrder(
        state.account,
        {
          id: String(state.account.orders.length + 1),
          security: SECURITY_BY_ID[action.securityId],
          side: action.side,
          amount: shekelsToAgorot(action.amount),
          placedAt: state.worldMs,
        },
        quotes(state),
      );
      return result.ok ? { ...state, account: result.account } : state;
    }
  }
}

export type LeagueRow = {
  name: string;
  isMe: boolean;
  value: number;
  returnPct: number;
  maxFallPct: number;
  score: number;
};

const ppmToPercent = (ppm: number) => (ppm / PPM_SCALE) * 100;

export function leagueTable(state: GameState): LeagueRow[] {
  const me = state.player ?? 'You';
  const players = [
    {
      name: me,
      value: enginePortfolioValue(state.account, quotes(state)),
      drawdown: state.drawdown,
    },
    ...state.rivals,
  ];
  const valueOf = Object.fromEntries(players.map((p) => [p.name, p.value]));
  return rankPlayers(
    players.map((p) => ({
      id: p.name,
      returnPpm: returnPpm(START_CASH, p.value),
      maxFallPpm: p.drawdown.maxFallPpm,
    })),
  ).map((p) => ({
    name: p.id,
    isMe: p.id === me,
    value: toShekels(valueOf[p.id]),
    returnPct: ppmToPercent(p.returnPpm),
    maxFallPct: ppmToPercent(p.maxFallPpm),
    score: p.score,
  }));
}
