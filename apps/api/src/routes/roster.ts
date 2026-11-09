// Everyone in the game, for the owner's admin page: real players and bots, kept apart.
// It sits behind the clock code and only reads. It never returns emails or sign-in details,
// so the clock code can be shared with a reviewer without showing anyone's email.

import { Hono } from 'hono';

import type { Deps } from '../app.ts';
import { israelDay } from '../services/streak.ts';
import { requireSecret } from './tick.ts';

export type RosterRow = {
  id: string;
  name: string;
  division: string; // where they play now, Bronze when they haven't played a week yet
  rank: number | null; // place on this week's table, if they're on it
  value: number | null; // portfolio value in agorot from this week's table
};

export type RealPlayer = RosterRow & {
  joinedAt: number; // real time
  lastDay: string | null; // the last day they opened the game, in Israel
  activeToday: boolean;
  streakDays: number;
  holdings: number; // how many securities they hold
  pendingOrders: number;
  inGroup: boolean;
};

export function rosterRoutes(deps: Deps) {
  const routes = new Hono();

  routes.post('/admin/players', async (c) => {
    requireSecret(c.req.header('Authorization'), deps.clockSecret);
    const realNow = deps.now();
    // Reads every player once, plus the league. Fine for the owner now and then.
    const [players, shards, table] = await Promise.all([
      deps.store.playersChangedSince(0),
      deps.store.getShards(),
      deps.store.getTable(),
    ]);
    const members = new Map(shards.flatMap((shard) => Object.values(shard.members)).map((m) => [m.id, m]));
    const rows = new Map((table?.rows ?? []).map((row) => [row.id, row]));
    const base = (id: string, name: string): RosterRow => ({
      id,
      name,
      division: members.get(id)?.division ?? 'bronze',
      rank: rows.get(id)?.rank ?? null,
      value: rows.get(id)?.value ?? null,
    });
    const today = israelDay(realNow);

    const real: RealPlayer[] = players
      .map((p) => ({
        ...base(p.uid, p.name),
        joinedAt: p.createdAt,
        lastDay: p.streak?.lastDay ?? null,
        activeToday: p.streak?.lastDay === today,
        streakDays: p.streak?.days ?? 0,
        holdings: Object.values(p.holdings).filter((units) => units > 0).length,
        pendingOrders: p.pendingOrders.length,
        inGroup: Boolean(p.groupId),
      }))
      .sort((a, b) => b.joinedAt - a.joinedAt);

    const bots = [...members.values()]
      .filter((m) => m.bot)
      .map((m) => base(m.id, m.name))
      .sort((a, b) => a.name.localeCompare(b.name));

    c.header('Cache-Control', 'no-store');
    return c.json({ checkedAt: realNow, today, players: real, bots });
  });

  return routes;
}
