// Pure game rules live here: no network, no database, no clock reads.
export * from './calendar.ts';
export * from './money.ts';
export * from './orders.ts';
export * from './recap.ts';
export * from './score.ts';
export * from './securities.ts';
export * from './week.ts';
export * from './world.ts';

// The API health check reads this.
export const START_CASH_ILS = 1_000_000;
