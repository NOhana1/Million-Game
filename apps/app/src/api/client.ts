// The only file that talks to the server. Shapes follow apps/api/CONTRACT.md.

import type { Division, Market, Order, Side, WorldSecurity } from '@portfolio-league/engine';

export type MarketRow = WorldSecurity & { price: number; priceDayAgo: number };
export type MarketData = {
  worldTime: number;
  usdIls: number;
  usdIlsDayAgo?: number;
  securities: MarketRow[];
};

export const RANGES = ['1D', '1W', '1M', '3M', '6M', '1Y', '5Y', 'ALL'] as const;
export type Range = (typeof RANGES)[number];
export type PricePoint = { at: number; price: number };
export type RangeHistory = { range: Range; gameStartedAt: number; points: PricePoint[] };

export type News = { source: string; headlines: { title: string; link: string }[] };

export type WorldData = {
  worldTime: number;
  clock: { speed: number; paused: boolean };
  markets: Record<Market, { open: boolean; nextChange: number }>;
};

export type Position = { securityId: string; units: number; value: number };

export type Me = {
  uid: string;
  name: string;
  cash: number;
  holdings: Record<string, number>;
  pendingOrders: Order[];
  worldTime: number;
  reserved: number;
  value: number;
  positions: Position[];
  goal?: number;
  watchlist?: string[];
};

export type Profile = {
  id: string;
  name: string;
  bot: boolean;
  division: Division;
  thisWeek: { rank: number; total: number; score: number; returnPpm: number; maxFallPpm: number } | null;
  honours: {
    weeksPlayed: number;
    wins: number;
    top3: number;
    bestRank: number | null;
    bestScore: number | null;
  };
};

export type LeagueRow = {
  rank: number;
  id: string;
  name: string;
  bot: boolean;
  value: number;
  returnPpm: number;
  maxFallPpm: number;
  score: number;
  division: Division;
  nextDivision?: Division;
};

export type LeagueTable = {
  updatedAt: number | null;
  weekEndsAt: number | null;
  previousWeekEndsAt: number | null;
  total: number;
  rows: LeagueRow[];
  indexes: Record<string, number>;
};

export type ClockChange =
  | { action: 'advance'; to: 'next' }
  | { action: 'pause' }
  | { action: 'resume' }
  | { action: 'speed'; speed: number };

export type ClockResult = {
  worldTime: number;
  settlement: { status: 'idle' | 'busy' | 'finished' | 'partial'; filled: number };
};

export type NewOrder = {
  id: string;
  securityId: string;
  side: Side;
  amount: number | 'all';
};

export class ApiProblem extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number, message: string) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

type Options = { token?: string; body?: unknown };

async function call<T>(method: string, path: string, { token, body }: Options = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const { code = 'SERVER_ERROR', message = 'Something went wrong.' } = data?.error ?? {};
    throw new ApiProblem(code, response.status, message);
  }
  return data as T;
}

export const api = {
  // A changing `fresh` value skips the CDN's copy. Only used right after moving the clock.
  world: (fresh?: number) => call<WorldData>('GET', `/world${fresh ? `?fresh=${fresh}` : ''}`),
  market: (fresh?: number) => call<MarketData>('GET', `/market${fresh ? `?fresh=${fresh}` : ''}`),
  history: (id: string, range: Range) =>
    call<RangeHistory>('GET', `/market/${id}/history?range=${range}`),
  sparks: () => call<Record<string, number[]>>('GET', '/market/sparks'),
  news: () => call<News>('GET', '/news'),
  me: (token: string) => call<Me>('GET', '/me', { token }),
  orders: (token: string) =>
    call<{ orders: Order[] }>('GET', '/me/orders?limit=50', { token }).then((r) => r.orders),
  createPlayer: (token: string, name: string) =>
    call<unknown>('POST', '/players', { token, body: { name } }),
  profile: (id: string) => call<Profile>('GET', `/players/${id}/profile`),
  myHistory: (token: string, range: Range) =>
    call<{ points: PricePoint[] }>('GET', `/me/history?range=${range}`, { token }),
  setWatchlist: (token: string, ids: string[]) =>
    call<unknown>('PUT', '/me/watchlist', { token, body: { ids } }),
  setGoal: (token: string, amount: number) =>
    call<unknown>('PUT', '/me/goal', { token, body: { amount } }),
  placeOrder: (token: string, order: NewOrder) =>
    call<Order>('POST', '/orders', { token, body: order }),
  league: () => call<LeagueTable>('GET', '/league'),
  finishedWeek: (endsAt: number) => call<LeagueTable>('GET', `/league/weeks/${endsAt}`),
  moveClock: (code: string, change: ClockChange) =>
    call<ClockResult>('POST', '/admin/clock', { token: code, body: change }),
};
