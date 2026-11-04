// The weekly competition: what is tracked for each player from Friday US close to Friday US close.

import { weekEndFor } from './calendar.ts';
import type { Agorot } from './money.ts';
import { type Account, holdsSecurity, portfolioValue, type QuoteSource } from './orders.ts';
import {
  type Drawdown,
  newDrawdown,
  rankPlayers,
  type Ranked,
  returnPpm,
  trackDrawdown,
} from './score.ts';

export type WeekRecord = {
  endsAt: number;
  startValue: Agorot;
  drawdown: Drawdown;
  heldSecurity: boolean;
};

/** A player joining mid-week starts here too, measured from the moment they join. */
export const startWeek = (now: number, value: Agorot, holding: boolean): WeekRecord => ({
  endsAt: weekEndFor(now),
  startValue: value,
  drawdown: newDrawdown(value),
  heldSecurity: holding,
});

export const recordValue = (week: WeekRecord, value: Agorot, holding: boolean): WeekRecord => ({
  ...week,
  drawdown: trackDrawdown(week.drawdown, value),
  heldSecurity: week.heldSecurity || holding,
});

/** The next week starts from the value at the end of this one. */
export const nextWeek = (week: WeekRecord, value: Agorot, holding: boolean): WeekRecord =>
  startWeek(week.endsAt + 1, value, holding);

/**
 * Catches up on price steps in one batch. Holdings only change when orders fill, which only
 * happens at a market open or close, so run this before settling each open and close.
 */
export function replaySteps(
  week: WeekRecord,
  account: Account,
  steps: readonly QuoteSource[],
): WeekRecord {
  const holding = holdsSecurity(account);
  return steps.reduce(
    (current, quotes) => recordValue(current, portfolioValue(account, quotes), holding),
    week,
  );
}

export type WeekEntry = { id: string; week: WeekRecord; value: Agorot };

/** Only players who held a security at some point this week appear in the table. */
export function weeklyTable(entries: readonly WeekEntry[]): Ranked[] {
  return rankPlayers(
    entries
      .filter((entry) => entry.week.heldSecurity)
      .map(({ id, week, value }) => ({
        id,
        returnPpm: returnPpm(week.startValue, value),
        maxFallPpm: week.drawdown.maxFallPpm,
      })),
  );
}
