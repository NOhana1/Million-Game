// FAKE WORLD for the front-end preview. The real price world arrives in Stage 3.

import type { Market } from '@portfolio-league/engine';

export { isMarketOpen, nextMarketEvent } from '@portfolio-league/engine';
export type { Market };

export type Security = {
  id: string;
  name: string;
  sector: string;
  market: Market;
  startPrice: number; // ILS for TASE, USD for US
  dailyVol: number;
};

const s = (
  id: string,
  name: string,
  sector: string,
  market: Market,
  startPrice: number,
  dailyVol = 0.015,
): Security => ({ id, name, sector, market, startPrice, dailyVol });

export const SECURITIES: Security[] = [
  s('TAIX', 'Tel Aviv Broad Index Fund', 'Fund', 'TASE', 212.4, 0.008),
  s('SHRN', 'Sharon Bank', 'Banks', 'TASE', 34.15),
  s('HGLL', 'HaGalil Foods', 'Consumer', 'TASE', 88.6, 0.01),
  s('NGVS', 'Negev Solar', 'Energy', 'TASE', 19.72, 0.03),
  s('YMSH', 'Yam Shipping', 'Transport', 'TASE', 57.3, 0.025),
  s('ARVA', 'Arava Pharma', 'Health', 'TASE', 146.9, 0.02),
  s('KNRT', 'Kinneret Real Estate', 'Real estate', 'TASE', 41.05),
  s('CYBR', 'Tzafon Cyber', 'Technology', 'TASE', 263.0, 0.028),
  s('MTLA', 'Metula Telecom', 'Telecom', 'TASE', 12.84, 0.012),
  s('EILT', 'Eilat Insurance', 'Insurance', 'TASE', 73.5),
  s('USIX', 'US Broad Index Fund', 'Fund', 'US', 508.2, 0.008),
  s('USTX', 'US Tech Index Fund', 'Fund', 'US', 431.75, 0.012),
  s('MRDN', 'Meridian Chips', 'Technology', 'US', 186.3, 0.03),
  s('SMTC', 'Summit Cloud', 'Technology', 'US', 94.1, 0.025),
  s('ATLP', 'Atlas Payments', 'Finance', 'US', 141.6, 0.018),
  s('RDWB', 'Redwood Bio', 'Health', 'US', 38.45, 0.035),
  s('BLPK', 'Bluepeak Energy', 'Energy', 'US', 72.9, 0.02),
  s('LKSR', 'Lakeshore Retail', 'Consumer', 'US', 118.2, 0.012),
  s('IRBR', 'Ironbridge Industrial', 'Industrial', 'US', 205.5, 0.014),
  s('PRFD', 'Prairie Foods', 'Consumer', 'US', 61.3, 0.009),
];

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
