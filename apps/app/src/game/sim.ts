// PREVIEW GAME running in the browser, so we can judge the screens before they use the backend.
// Rules and prices come from the engine. Only the fake rivals and the clock speed live here.
// Reloading the page resets everything.

import {
  type Account,
  AGOROT_PER_SHEKEL,
  createWorld,
  FX_SCALE,
  holdingValue as engineHoldingValue,
  holdsSecurity,
  maxOrderAmount as engineMaxOrderAmount,
  type Market,
  MARKETS,
  newAccount,
  nextWeek,
  normalFrom,
  type Order,
  orderProblem as engineOrderProblem,
  type OrderProblem,
  placeOrder,
  portfolioValue as enginePortfolioValue,
  PPM_SCALE,
  PRICE_SCALE,
  quoteFor,
  type QuoteSource,
  recordValue,
  reservedCash as engineReservedCash,
  settleDueOrders,
  shekelsToAgorot,
  type Side,
  START_CASH,
  startWeek,
  STEP_MS,
  UNIT_SCALE,
  weeklyTable,
  type WeekRecord,
  WORLD_START,
  type WorldState,
} from '@portfolio-league/engine';

import { demoNoise } from './demo-noise';
import { isMarketOpen, nextMarketEvent, SECURITIES, SECURITY_BY_ID, Security } from './world';

export type { Order, Side };

export const START_SHEKELS = START_CASH / AGOROT_PER_SHEKEL;
export const WORLD_MS_PER_TICK = STEP_MS; // one real second = one five minute price step
const RIVAL_STEP_SCALE = 1 / 13; // about one daily move over a trading day

const world = createWorld(demoNoise);
const firstState = world.stateAt(WORLD_START);

type Rival = { name: string; vol: number; value: number; week: WeekRecord };

export type GameState = {
  player: string | null;
  paused: boolean;
  worldMs: number;
  fx: number;
  prices: Record<string, number>;
  dayStart: Record<string, number>;
  account: Account;
  week: WeekRecord;
  rivals: Rival[];
};

const rival = (name: string, vol: number): Rival => ({
  name,
  vol,
  value: START_CASH,
  week: startWeek(WORLD_START, START_CASH, vol > 0),
});

export const initialState: GameState = {
  player: null,
  paused: false,
  worldMs: WORLD_START,
  fx: firstState.fx,
  prices: firstState.prices,
  dayStart: firstState.prices,
  account: newAccount(),
  week: startWeek(WORLD_START, START_CASH, false),
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
export const orderRefund = (order: Order) => toShekels(order.fill?.refund ?? 0);
export const reservedCash = (state: GameState) => toShekels(engineReservedCash(state.account));
export const portfolioValue = (state: GameState) =>
  toShekels(enginePortfolioValue(state.account, quotes(state)));
export const holdingValue = (state: GameState, id: string) =>
  toShekels(engineHoldingValue(state.account, id, quotes(state)));

export const canSellAll = (state: GameState, id: string) =>
  Boolean(state.account.holdings[id]) &&
  !state.account.orders.some((o) => o.status === 'pending' && o.securityId === id && o.sellAll);

export const maxOrderAmount = (state: GameState, security: Security, side: Side) =>
  Math.floor(toShekels(engineMaxOrderAmount(state.account, security.id, side, quotes(state))));

const PROBLEM_TEXT: Partial<Record<OrderProblem, string>> = {
  INVALID_AMOUNT: 'Enter an amount.',
  BELOW_MINIMUM: 'The minimum order is ₪100.',
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

function moveRival(rival: Rival, at: number, trading: boolean): Rival {
  const move = rival.vol * RIVAL_STEP_SCALE * normalFrom(demoNoise(`rival|${rival.name}|${at}`));
  const value = trading ? Math.round(rival.value * (1 + move)) : rival.value;
  const week = recordValue(rival.week, value, rival.vol > 0);
  return { ...rival, value, week: at >= week.endsAt ? nextWeek(week, value, rival.vol > 0) : week };
}

/** One price step: new prices, then any orders due, then the weekly records. */
function applyStep(state: GameState, step: WorldState): GameState {
  const previous = step.at - STEP_MS;
  const openedNow = (market: Market) =>
    !isMarketOpen(market, previous) && isMarketOpen(market, step.at);

  const dayStart = { ...state.dayStart };
  for (const security of SECURITIES) {
    if (openedNow(security.market)) dayStart[security.id] = step.prices[security.id];
  }

  const trading = MARKETS.some((market) => isMarketOpen(market, previous));
  const next: GameState = {
    ...state,
    worldMs: step.at,
    prices: step.prices,
    dayStart,
    fx: step.fx,
    rivals: state.rivals.map((r) => moveRival(r, step.at, trading)),
  };

  const current = quotes(next);
  const account = settleDueOrders(next.account, step.at, () => current);
  const value = enginePortfolioValue(account, current);
  const holding = holdsSecurity(account);
  const week = recordValue(next.week, value, holding);
  return {
    ...next,
    account,
    week: step.at >= week.endsAt ? nextWeek(week, value, holding) : week,
  };
}

function moveTo(state: GameState, targetMs: number): GameState {
  const moved = world.stepsBetween(state.worldMs, targetMs).reduce(applyStep, state);
  return { ...moved, worldMs: targetMs };
}

export type Action =
  | { type: 'join'; name: string }
  | { type: 'tick' }
  | { type: 'togglePause' }
  | { type: 'skipToNextEvent' }
  | { type: 'placeOrder'; securityId: string; side: Side; amount: number | 'all' };

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
          amount: action.amount === 'all' ? 'all' : shekelsToAgorot(action.amount),
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
    { id: me, value: enginePortfolioValue(state.account, quotes(state)), week: state.week },
    ...state.rivals.map((r) => ({ id: r.name, value: r.value, week: r.week })),
  ];
  const valueOf = Object.fromEntries(players.map((p) => [p.id, p.value]));
  return weeklyTable(players).map((p) => ({
    name: p.id,
    isMe: p.id === me,
    value: toShekels(valueOf[p.id]),
    returnPct: ppmToPercent(p.returnPpm),
    maxFallPct: ppmToPercent(p.maxFallPpm),
    score: p.score,
  }));
}
