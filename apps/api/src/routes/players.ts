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
import { findListing, isRange, quotesAt } from '../market/quotes.ts';
import { toAccount } from '../player.ts';
import { portfolioHistory } from '../services/portfolio-history.ts';
import type { Order } from '@portfolio-league/engine';

import type { Player, Store } from '../store/types.ts';

const NewPlayer = z.object({
  // No control characters: the name is shown to every other player.
  name: z.string().trim().min(2).max(24).regex(/^[^\p{Cc}]+$/u),
});

const MAX_GOAL = 100_000_000_000; // ₪1,000,000,000 in agorot

const Goal = z.object({ amount: z.number().int().positive().max(MAX_GOAL) });

const MOST_WATCHED = 20;
// The app shrinks a picture to a small square JPEG before sending it, so a few kilobytes is plenty.
// The larger picture is kept only so its owner can adjust the framing later.
const MOST_PHOTO_LETTERS = 60_000;
const MOST_ORIGINAL_LETTERS = 300_000;
const jpeg = (most: number) =>
  z
    .string()
    .max(most)
    .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/, 'Send a JPEG picture.');
const Photo = z.object({
  photo: jpeg(MOST_PHOTO_LETTERS),
  original: jpeg(MOST_ORIGINAL_LETTERS),
  crop: z.object({ zoom: z.number().min(1).max(4), x: z.number().min(-2).max(2), y: z.number().min(-2).max(2) }),
});
const Watchlist = z.object({ ids: z.array(z.string().max(10)).max(MOST_WATCHED) });

const ORDER_PAGE = 100;
const MOST_ORDERS = 1000;

/** Every order, newest first, a page at a time. */
async function allOrders(store: Store, uid: string) {
  const orders: Awaited<ReturnType<Store['listOrders']>> = [];
  while (orders.length < MOST_ORDERS) {
    const last = orders.at(-1);
    const page = await store.listOrders(uid, {
      limit: ORDER_PAGE,
      after: last ? { placedAt: last.placedAt, id: last.id } : undefined,
    });
    orders.push(...page);
    if (page.length < ORDER_PAGE) break;
  }
  return orders;
}

const REMEMBERED_PLAYERS = 200; // order lists kept in memory, to bound this server's memory

/**
 * Every fill and every new order changes the player's cash, waiting orders or `changedAt`, in
 * the same write as the orders. So while these match, the stored order list is still right.
 */
const ordersVersion = (player: Player) =>
  JSON.stringify([player.changedAt, player.cash, player.pendingOrders.map((order) => order.id)]);

const newPlayer = (uid: string, name: string, now: number, world: number): Player => {
  const { cash, holdings } = newAccount();
  return {
    uid,
    name,
    createdAt: now,
    cash,
    holdings,
    pendingOrders: [],
    nextDueAt: null,
    changedAt: world,
  };
};

export function playerRoutes(deps: Deps) {
  const routes = new Hono<AuthEnv>();
  const signedIn = requireUser(deps.verifyToken);
  // Portfolio history reads every order. This server remembers each player's list and reuses
  // it until the player changes, so switching chart ranges costs 2 reads instead of hundreds.
  const rememberedOrders = new Map<string, { version: string; orders: Order[] }>();

  const ordersOf = async (player: Player) => {
    const version = ordersVersion(player);
    const remembered = rememberedOrders.get(player.uid);
    if (remembered?.version === version) return remembered.orders;
    const orders = await allOrders(deps.store, player.uid);
    rememberedOrders.delete(player.uid); // re-adding moves it to the newest end
    rememberedOrders.set(player.uid, { version, orders });
    if (rememberedOrders.size > REMEMBERED_PLAYERS) {
      rememberedOrders.delete(rememberedOrders.keys().next().value as string);
    }
    return orders;
  };

  routes.post('/players', signedIn, async (c) => {
    const { name } = await readBody(c, NewPlayer);
    const realNow = deps.now();
    const world = worldTime(await deps.store.getClock(realNow), realNow);
    const { player, created } = await deps.store.createPlayer(
      newPlayer(c.get('uid'), name, realNow, world),
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

  routes.get('/me/history', signedIn, async (c) => {
    const range = c.req.query('range') ?? 'ALL';
    if (!isRange(range)) throw new ApiError(400, 'UNKNOWN_RANGE', 'No such range.');
    const player = await deps.store.getPlayer(c.get('uid'));
    if (!player) throw new ApiError(404, 'PLAYER_NOT_FOUND', 'Create a player first.');
    const world = worldTime(await deps.store.getClock(deps.now()), deps.now());
    const orders = await ordersOf(player);
    c.header('Cache-Control', 'private, max-age=30');
    return c.json(portfolioHistory(deps.feed, orders, world, range));
  });

  routes.put('/me/watchlist', signedIn, async (c) => {
    const { ids } = await readBody(c, Watchlist);
    if (!ids.every((id) => findListing(deps.feed, id))) {
      throw new ApiError(404, 'UNKNOWN_SECURITY', 'No such security.');
    }
    const unique = [...new Set(ids)];
    if (!(await deps.store.setWatchlist(c.get('uid'), unique))) {
      throw new ApiError(404, 'PLAYER_NOT_FOUND', 'Create a player first.');
    }
    return c.json({ ids: unique });
  });

  routes.put('/me/photo', signedIn, async (c) => {
    const saved = await readBody(c, Photo);
    if (!(await deps.store.setPhoto(c.get('uid'), saved))) {
      throw new ApiError(404, 'PLAYER_NOT_FOUND', 'Create a player first.');
    }
    return c.json({ photo: saved.photo });
  });

  routes.get('/me/photo', signedIn, async (c) => {
    return c.json({ saved: await deps.store.getPhotoOriginal(c.get('uid')) });
  });

  routes.delete('/me/photo', signedIn, async (c) => {
    if (!(await deps.store.setPhoto(c.get('uid'), null))) {
      throw new ApiError(404, 'PLAYER_NOT_FOUND', 'Create a player first.');
    }
    return c.json({ photo: null });
  });

  routes.put('/me/goal', signedIn, async (c) => {
    const { amount } = await readBody(c, Goal);
    if (!(await deps.store.setGoal(c.get('uid'), amount))) {
      throw new ApiError(404, 'PLAYER_NOT_FOUND', 'Create a player first.');
    }
    return c.json({ goal: amount });
  });

  return routes;
}
