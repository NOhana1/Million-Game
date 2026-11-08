// What a player has achieved, counted from the finished weeks. Nothing extra is stored, so past
// weeks count too and the league code doesn't change. Only results show here, never holdings.

import { DIVISIONS, FIRST_DIVISION } from '@portfolio-league/engine';

import type { LeagueTable } from '../store/types.ts';

const TOP = 3;

export type Honours = {
  weeksPlayed: number;
  wins: number;
  top3: number;
  bestRank: number | null;
  bestScore: number | null;
  beatMarket: number; // weeks with a better return than every index fund
  movedUp: number; // weeks that ended with a move to a higher division
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
  };
}

/** Where the last finished week left them, for someone not on this week's table yet. */
export function lastDivision(weeks: readonly LeagueTable[], id: string) {
  const row = rowsOf(weeks, id).at(-1);
  return row?.nextDivision ?? row?.division ?? FIRST_DIVISION;
}

export const nameIn = (weeks: readonly LeagueTable[], id: string) => rowsOf(weeks, id).at(-1)?.name;
