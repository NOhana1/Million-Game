// Placing orders. The rules are the engine's: this file only supplies the server's time and
// prices, and saves the result. There is deliberately no way to cancel an order (Rule 3).

import { type OrderProblem, placeOrder } from '@portfolio-league/engine';
import { Hono } from 'hono';
import { z } from 'zod';

import type { Deps } from '../app.ts';
import { type AuthEnv, requireUser } from '../auth.ts';
import { readBody } from '../body.ts';
import { type Clock, worldTime } from '../clock.ts';
import { ApiError } from '../errors.ts';
import type { Listing } from '../market/feed.ts';
import { findListing, quotesAt } from '../market/quotes.ts';
import type { Decision, Player } from '../store/types.ts';
import { toAccount } from './players.ts';

export const MAX_PENDING_ORDERS = 50;
const MAX_PAGE = 50;

const NewOrder = z.object({
  id: z.uuid(), // made by the client, so a retry or double tap can't place a second order
  securityId: z.string().max(10),
  side: z.enum(['buy', 'sell']),
  amount: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
});

const PROBLEMS: Record<OrderProblem, string> = {
  INVALID_AMOUNT: 'Enter an amount above zero.',
  DUPLICATE_ORDER: 'This order was already placed.',
  INSUFFICIENT_CASH: 'Not enough available cash.',
  POSITION_LIMIT: 'This would put more than 20% of the portfolio in one security.',
  INSUFFICIENT_HOLDING: 'You cannot sell more than you hold.',
};

type Request = z.output<typeof NewOrder>;

/** Runs inside the transaction, so it must only depend on its arguments. */
function decide(
  deps: Deps,
  request: Request,
  listing: Listing,
  realNow: number,
  player: Player | null,
  clock: Clock,
): Decision {
  if (!player) throw new ApiError(404, 'PLAYER_NOT_FOUND', 'Create a player first.');
  if (player.pendingOrders.length >= MAX_PENDING_ORDERS) {
    throw new ApiError(409, 'TOO_MANY_PENDING', 'Wait for some orders to fill first.');
  }

  const world = worldTime(clock, realNow);
  const result = placeOrder(
    toAccount(player),
    {
      id: request.id,
      security: { id: listing.id, market: listing.market },
      side: request.side,
      amount: request.amount,
      placedAt: world,
    },
    quotesAt(deps.feed, world),
  );
  if (!result.ok) throw new ApiError(422, result.problem, PROBLEMS[result.problem]);

  return {
    order: result.order,
    player: { ...player, cash: result.account.cash, pendingOrders: result.account.orders },
  };
}

const Page = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_PAGE).default(20),
  after: z
    .string()
    .regex(/^\d+_[\w-]+$/)
    .optional(),
});

export function orderRoutes(deps: Deps) {
  const routes = new Hono<AuthEnv>();
  const signedIn = requireUser(deps.verifyToken);

  routes.post('/orders', signedIn, async (c) => {
    const request = await readBody(c, NewOrder);
    const listing = findListing(deps.feed, request.securityId);
    if (!listing) throw new ApiError(404, 'UNKNOWN_SECURITY', 'No such security.');

    const realNow = deps.now();
    const { order, created } = await deps.store.placeOrder({
      uid: c.get('uid'),
      orderId: request.id,
      realNow,
      decide: (player, clock) => decide(deps, request, listing, realNow, player, clock),
    });
    return c.json(order, created ? 201 : 200);
  });

  routes.get('/me/orders', signedIn, async (c) => {
    const page = Page.safeParse(c.req.query());
    if (!page.success) throw new ApiError(400, 'INVALID_QUERY', 'Invalid paging.');
    const [placedAt, ...id] = page.data.after?.split('_') ?? [];
    const orders = await deps.store.listOrders(c.get('uid'), {
      limit: page.data.limit,
      after: placedAt ? { placedAt: Number(placedAt), id: id.join('_') } : undefined,
    });
    const last = orders.at(-1);
    const next = last && orders.length === page.data.limit ? `${last.placedAt}_${last.id}` : null;
    return c.json({ orders, next });
  });

  return routes;
}
