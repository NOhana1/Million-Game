import { type Market, SECURITIES, type WorldSecurity } from '@portfolio-league/engine';

export { isMarketOpen, nextMarketEvent } from '@portfolio-league/engine';
export type { Market };

export type Security = WorldSecurity;

export { SECURITIES };

export const SECURITY_BY_ID = Object.fromEntries(SECURITIES.map((x) => [x.id, x]));

export const MARKET_LABEL: Record<Market, string> = { TASE: 'Tel Aviv', US: 'US' };

const worldTimeFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Jerusalem',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export const formatWorldTime = (ms: number) => worldTimeFormat.format(ms);
