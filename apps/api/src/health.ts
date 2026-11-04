import { START_CASH_ILS } from '@portfolio-league/engine';

// Placeholder that proves the API can import the engine. Step 3 serves it.
export function health() {
  return { ok: true, startCash: START_CASH_ILS };
}
