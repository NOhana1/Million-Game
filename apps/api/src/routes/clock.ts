// Moving the shared clock. Its own secret can do nothing else, apart from reading the players
// list (routes/roster.ts, no emails), so it can be shared with a reviewer, or a GitHub button,
// without exposing anything that can touch players or orders.

import { nextMarketEvent } from '@portfolio-league/engine';
import { Hono } from 'hono';
import { z } from 'zod';

import type { Deps } from '../app.ts';
import { readBody } from '../body.ts';
import { advancedTo, type Clock, paused, withSpeed, withTrading, worldTime } from '../clock.ts';
import { settle } from '../services/settlement.ts';
import { requireSecret } from './tick.ts';

// The limit protects the free database quota: speed multiplies the daily settlement work.
const MAX_SPEED = 60;

const Change = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('advance'),
    to: z.union([z.number().int().positive(), z.literal('next')]),
  }),
  z.object({ action: z.literal('pause') }),
  z.object({ action: z.literal('resume') }),
  z.object({ action: z.literal('speed'), speed: z.number().min(1).max(MAX_SPEED) }),
  z.object({ action: z.literal('trading'), open: z.boolean() }),
]);

function applied(change: z.output<typeof Change>, clock: Clock, realNow: number): Clock {
  switch (change.action) {
    case 'advance': {
      const target = change.to === 'next' ? nextMarketEvent(worldTime(clock, realNow)) : change.to;
      return advancedTo(clock, target, realNow);
    }
    case 'pause':
      return paused(clock, realNow, true);
    case 'resume':
      return paused(clock, realNow, false);
    case 'speed':
      return withSpeed(clock, realNow, change.speed);
    case 'trading':
      return withTrading(clock, change.open);
  }
}

export function clockRoutes(deps: Deps) {
  const routes = new Hono();

  routes.post('/admin/clock', async (c) => {
    requireSecret(c.req.header('Authorization'), deps.clockSecret);
    const change = await readBody(c, Change);
    const realNow = deps.now();
    const clock = await deps.store.updateClock(realNow, (current) =>
      applied(change, current, realNow),
    );
    return c.json({
      worldTime: worldTime(clock, realNow),
      clock,
      settlement: await settle(deps),
    });
  });

  return routes;
}
