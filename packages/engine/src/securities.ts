// The 20 fictional securities of the game world. Names are invented on purpose, because
// showing made-up prices for real companies would be misleading.

import type { Market } from './calendar.ts';
import { type Price, PRICE_SCALE } from './money.ts';
import type { Security } from './orders.ts';

export type WorldSecurity = Security & {
  name: string;
  sector: string;
  startPrice: Price;
  dailyVol: number; // typical daily move, as a fraction
};

const row = (
  id: string,
  name: string,
  sector: string,
  market: Market,
  price: number,
  dailyVol: number,
): WorldSecurity => ({
  id,
  name,
  sector,
  market,
  startPrice: Math.round(price * PRICE_SCALE),
  dailyVol,
});

export const FUND_SECTOR = 'Fund';

/** The funds players compare themselves with. They stand in for the market as a whole. */
export const INDEX_FUNDS = ['USIX', 'USTX', 'TAIX'] as const;

export const SECURITIES: readonly WorldSecurity[] = [
  row('TAIX', 'Tel Aviv Broad Index Fund', FUND_SECTOR, 'TASE', 212.4, 0.008),
  row('SHRN', 'Sharon Bank', 'Banks', 'TASE', 34.15, 0.015),
  row('HGLL', 'HaGalil Foods', 'Consumer', 'TASE', 88.6, 0.01),
  row('NGVS', 'Negev Solar', 'Energy', 'TASE', 19.72, 0.03),
  row('YMSH', 'Yam Shipping', 'Transport', 'TASE', 57.3, 0.025),
  row('ARVA', 'Arava Pharma', 'Health', 'TASE', 146.9, 0.02),
  row('KNRT', 'Kinneret Real Estate', 'Real estate', 'TASE', 41.05, 0.015),
  row('CYBR', 'Tzafon Cyber', 'Technology', 'TASE', 263.0, 0.028),
  row('MTLA', 'Metula Telecom', 'Telecom', 'TASE', 12.84, 0.012),
  row('EILT', 'Eilat Insurance', 'Insurance', 'TASE', 73.5, 0.015),
  row('USIX', 'US Broad Index Fund', FUND_SECTOR, 'US', 508.2, 0.008),
  row('USTX', 'US Tech Index Fund', FUND_SECTOR, 'US', 431.75, 0.012),
  row('MRDN', 'Meridian Chips', 'Technology', 'US', 186.3, 0.03),
  row('SMTC', 'Summit Cloud', 'Technology', 'US', 94.1, 0.025),
  row('ATLP', 'Atlas Payments', 'Finance', 'US', 141.6, 0.018),
  row('RDWB', 'Redwood Bio', 'Health', 'US', 38.45, 0.035),
  row('BLPK', 'Bluepeak Energy', 'Energy', 'US', 72.9, 0.02),
  row('LKSR', 'Lakeshore Retail', 'Consumer', 'US', 118.2, 0.012),
  row('IRBR', 'Ironbridge Industrial', 'Industrial', 'US', 205.5, 0.014),
  row('PRFD', 'Prairie Foods', 'Consumer', 'US', 61.3, 0.009),
];
