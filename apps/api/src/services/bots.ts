// Computer players, so a new league isn't empty. They trade through the engine's normal rules.
// They live only in league shards, with no player or order documents, so they cost no writes.

import { createHash, randomUUID } from 'node:crypto';

import {
  type Account,
  type Agorot,
  DIVISIONS,
  maxOrderAmount,
  type Order,
  placeOrder,
  portfolioValue,
  type QuoteSource,
  SECURITIES,
  START_CASH,
  startWeek,
  type WorldSecurity,
} from '@portfolio-league/engine';

import type { Member } from '../store/types.ts';

const BOTS_PER_STYLE = 4;
const PICKS = 5;

type Style = {
  name: string;
  percentEach: number; // of the portfolio, per security
  rotates: boolean; // sells everything at the start of each week, and picks again
  universe(securities: readonly WorldSecurity[]): readonly WorldSecurity[];
};

const byRisk = (securities: readonly WorldSecurity[]) =>
  [...securities].sort((a, b) => a.dailyVol - b.dailyVol);

const STYLES: Style[] = [
  { name: 'Index Holder', percentEach: 19, rotates: false, universe: (s) => byRisk(s).slice(0, 8) },
  { name: 'All-In Gambler', percentEach: 19, rotates: true, universe: (s) => byRisk(s).slice(-7) },
  { name: 'Cash Keeper', percentEach: 3, rotates: false, universe: (s) => byRisk(s).slice(0, 10) },
  {
    name: 'Tech Chaser',
    percentEach: 19,
    rotates: true,
    universe: (s) => s.filter((security) => security.sector === 'Technology'),
  },
  { name: 'Random Picker', percentEach: 15, rotates: true, universe: (s) => s },
];

const styleOf = (member: Member) =>
  STYLES.find((style) => member.name.startsWith(style.name)) as Style;

const rank = (text: string) => createHash('sha256').update(text).digest().readUInt32BE(0);

/** A fixed choice for each bot and week, so a rerun picks exactly the same. */
function picksFor(member: Member, style: Style): WorldSecurity[] {
  const key = (id: string) => rank(`${member.id}:${member.week.endsAt}:${id}`);
  return [...style.universe(SECURITIES)]
    .sort((a, b) => key(a.id) - key(b.id))
    .slice(0, PICKS);
}

export const memberAccount = (member: Member): Account => ({
  cash: member.cash,
  holdings: member.holdings,
  orders: member.orders,
});

export function createBots(now: number): Member[] {
  return STYLES.flatMap((style, styleIndex) =>
    Array.from({ length: BOTS_PER_STYLE }, (_, i) => ({
      id: `bot-${styleIndex}-${i}`,
      name: `${style.name} ${i + 1} (bot)`,
      bot: true,
      cash: START_CASH,
      holdings: {},
      orders: [],
      week: startWeek(now, START_CASH, false),
    })),
  );
}

const pick = <T>(items: readonly T[], random: () => number): T =>
  items[Math.floor(random() * items.length)] as T;

/**
 * One more bot, added by the owner: a random style, a random division, and its own picks, which
 * it buys straight away. The orders fill at the next market open or close, like anyone's, and it
 * shows on the table from then on. Badges come from finished weeks, so it earns them like anyone.
 */
export function newBot(
  existing: readonly Member[],
  worldNow: number,
  quotes: QuoteSource,
  random: () => number = Math.random,
): Member {
  const style = pick(STYLES, random);
  const used = new Set(existing.map((member) => member.name));
  let number = 1;
  while (used.has(`${style.name} ${number} (bot)`)) number += 1;
  const bot: Member = {
    id: `bot-${randomUUID()}`,
    name: `${style.name} ${number} (bot)`,
    bot: true,
    cash: START_CASH,
    holdings: {},
    orders: [],
    week: startWeek(worldNow, START_CASH, false),
    division: pick(DIVISIONS, random),
  };
  const account = botActs(bot, worldNow, quotes, false);
  return { ...bot, cash: account.cash, orders: account.orders };
}

function placed(
  member: Member,
  account: Account,
  security: Pick<WorldSecurity, 'id' | 'market'>,
  side: Order['side'],
  amount: Agorot | 'all',
  at: number,
  quotes: QuoteSource,
): Account {
  const id = `${member.id}-${at}-${security.id}`;
  const result = placeOrder(account, { id, security, side, amount, placedAt: at }, quotes);
  return result.ok ? result.account : account; // a refused order is simply not placed
}

/** One decision at a market open or close. Returns the bot's account after it. */
export function botActs(member: Member, at: number, quotes: QuoteSource, weekStarted: boolean): Account {
  let account = memberAccount(member);
  if (account.orders.length > 0) return account;
  const style = styleOf(member);

  const held = Object.keys(account.holdings);
  if (held.length === 0) {
    const budget = (portfolioValue(account, quotes) * style.percentEach) / 100;
    for (const security of picksFor(member, style)) {
      const room = maxOrderAmount(account, security.id, 'buy', quotes);
      const amount = Math.floor(Math.min(budget, room));
      account = placed(member, account, security, 'buy', amount, at, quotes);
    }
    return account;
  }

  if (style.rotates && weekStarted) {
    for (const security of SECURITIES.filter((s) => held.includes(s.id))) {
      account = placed(member, account, security, 'sell', 'all', at, quotes);
    }
  }
  return account;
}
