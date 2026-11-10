// What removing someone changes in the league, shared by both stores. A real player and a bot are
// removed by different actions, so each only ever matches its own kind.

import type { LeagueTable, Shard } from './types.ts';

/** The shards that held them, without them. Shards they weren't in are left out. */
export function shardsWithout(shards: readonly Shard[], id: string, bot = false): Shard[] {
  return shards
    .filter((shard) => shard.members[id] && shard.members[id].bot === bot)
    .map((shard) => {
      const { [id]: _gone, ...members } = shard.members;
      return { ...shard, members };
    });
}

/** The table without them, ranks closed up. Null if they weren't on it. */
export function tableWithout(table: LeagueTable | null, id: string, bot = false): LeagueTable | null {
  if (!table?.rows.some((row) => row.id === id && row.bot === bot)) return null;
  const rows = table.rows
    .filter((row) => row.id !== id)
    .map((row, index) => ({ ...row, rank: index + 1 }));
  return { ...table, rows, total: rows.length };
}
