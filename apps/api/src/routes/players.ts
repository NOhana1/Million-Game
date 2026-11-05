import {
  holdingValue,
  newAccount,
  portfolioValue,
  reservedCash,
} from '@portfolio-league/engine';
import { Hono } from 'hono';
import { z } from 'zod';

import type { Deps } from '../app.ts';
import { type AuthEnv, requireUser } from '../auth.ts';
import { readBody } from '../body.ts';
import { worldTime } from '../clock.ts';
import { ApiError } from '../errors.ts';
import { quotesAt } from '../market/quotes.ts';
import { toAccount } from '../player.ts';
import type { Player } from '../store/types.ts';

const NewPlayer = z.object({
  // No control characters: the name is shown to every other player.
  name: z.string().trim().min(2).max(24).regex(/^[^\p{Cc}]+$/u),
});

const newPlayer = (uid: string, name: string, now: number): Player => {
  const { cash, holdings } = newAccount();
  return { uid, name, createdAt: now, cash, holdings, pendingOrders: [], nextDueAt: null };
};

export function playerRoutes(deps: Deps) {
  const routes = new Hono<AuthEnv>();
  const signedIn = requireUser(deps.verifyToken);

  routes.post('/players', signedIn, async (c) => {
    const { name } = await readBody(c, NewPlayer);
    const { player, created } = await deps.store.createPlayer(
      newPlayer(c.get('uid'), name, deps.now()),
    );
    return c.json(player, created ? 201 : 200);
  });

  routes.get('/me', signedIn, async (c) => {
    const player = await deps.store.getPlayer(c.get('uid'));
    if (!player) throw new ApiError(404, 'PLAYER_NOT_FOUND', 'Create a player first.');
    const world = worldTime(await deps.store.getClock(deps.now()), deps.now());
    const quotes = quotesAt(deps.feed, world);
    const account = toAccount(player);
    return c.json({
      ...player,
      worldTime: world,
      reserved: reservedCash(account),
      value: portfolioValue(account, quotes),
      positions: Object.entries(player.holdings).map(([securityId, units]) => ({
        securityId,
        units,
        value: holdingValue(account, securityId, quotes),
      })),
    });
  });

  return routes;
}
