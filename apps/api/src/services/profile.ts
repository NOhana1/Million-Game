// What a player has achieved, counted from the finished weeks. Nothing extra is stored, so past
// weeks count too and the league code doesn't change. Only results show here, never holdings.

import { DIVISIONS, type Division, FIRST_DIVISION } from '@portfolio-league/engine';

import type { LeagueTable } from '../store/types.ts';

const TOP = 3;
const BIG_WEEK_PPM = 50_000; // a return of 5% or more
const STEADY_FALL_PPM = 10_000; // a largest fall under 1%

export type Honours = {
  weeksPlayed: number;
  wins: number;
  top3: number;
  bestRank: number | null;
  bestScore: number | null;
  beatMarket: number; // weeks with a better return than every index fund
  movedUp: number; // weeks that ended with a move to a higher division
  bigWeeks: number; // weeks with a return of 5% or more
  steadyWeeks: number; // weeks with a gain and a largest fall under 1%
  highestDivision: Division | null; // the highest division they've played in or moved up to
};

/** The player's row in each week they played, oldest first. */
const weeksOf = (weeks: readonly LeagueTable[], id: string) =>
  [...weeks]
    .sort((a, b) => a.weekEndsAt - b.weekEndsAt)
    .flatMap((week) => week.rows.filter((row) => row.id === id).map((row) => ({ row, week })));

const rowsOf = (weeks: readonly LeagueTable[], id: string) => weeksOf(weeks, id).map(({ row }) => row);

const beatEveryFund = (returnPpm: number, week: LeagueTable) => {
  const funds = Object.values(week.indexes ?? {});
  return funds.length > 0 && funds.every((fund) => returnPpm > fund);
};

export function honoursOf(weeks: readonly LeagueTable[], id: string): Honours {
  const played = weeksOf(weeks, id);
  const rows = played.map(({ row }) => row);
  const ranks = rows.map((row) => row.rank);
  return {
    weeksPlayed: rows.length,
    wins: ranks.filter((rank) => rank === 1).length,
    top3: ranks.filter((rank) => rank <= TOP).length,
    bestRank: ranks.length > 0 ? Math.min(...ranks) : null,
    bestScore: rows.length > 0 ? Math.max(...rows.map((row) => row.score)) : null,
    beatMarket: played.filter(({ row, week }) => beatEveryFund(row.returnPpm, week)).length,
    movedUp: rows.filter(
      (row) => row.nextDivision && DIVISIONS.indexOf(row.nextDivision) > DIVISIONS.indexOf(row.division),
    ).length,
    bigWeeks: rows.filter((row) => row.returnPpm >= BIG_WEEK_PPM).length,
    steadyWeeks: rows.filter((row) => row.returnPpm > 0 && row.maxFallPpm < STEADY_FALL_PPM).length,
    highestDivision: rows.reduce<Division | null>((best, row) => {
      const reached = [row.division, row.nextDivision ?? row.division];
      return [best ?? FIRST_DIVISION, ...reached].reduce((a, b) =>
        DIVISIONS.indexOf(b) > DIVISIONS.indexOf(a) ? b : a,
      );
    }, null),
  };
}

/** Where the last finished week left them, for someone not on this week's table yet. */
export function lastDivision(weeks: readonly LeagueTable[], id: string) {
  const row = rowsOf(weeks, id).at(-1);
  return row?.nextDivision ?? row?.division ?? FIRST_DIVISION;
}

export const nameIn = (weeks: readonly LeagueTable[], id: string) => rowsOf(weeks, id).at(-1)?.name;
