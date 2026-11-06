// The weekly competition. Each market open and close, every player is brought up to date in
// memory, and everything is saved in one go. So the cost depends on the number of shards,
// not the number of players.

import {
  divisionMoves,
  FIRST_DIVISION,
  holdsSecurity,
  INDEX_FUNDS,
  nextWeek,
  partsPerMillion,
  portfolioValue,
  type QuoteSource,
  recordValue,
  replaySteps,
  reservedCash,
  settleDueOrders,
  startWeek,
  weeklyTable,
  weekStartFor,
  WORLD_START,
} from '@portfolio-league/engine';

import type { PriceFeed } from '../market/feed.ts';
import { priceSteps, quotesAt } from '../market/quotes.ts';
import { toAccount } from '../player.ts';
import type { LeagueTable, Member, Player, Shard, SlotSave, TableRow } from '../store/types.ts';
import { botActs, createBots, memberAccount } from './bots.ts';

const SHARD_SIZE = 1000; // well under Firestore's 1 MB per document
const TABLE_ROWS = 500;

const allMembers = (shards: readonly Shard[]) => shards.flatMap((s) => Object.values(s.members));

export function firstShards(now: number): Shard[] {
  return [{ id: '0', members: Object.fromEntries(createBots(now).map((bot) => [bot.id, bot])) }];
}

/** Before fills: catches each player's week up on the price steps since the last slot. */
export function replayToSlot(feed: PriceFeed, shards: Shard[], from: number, slot: number) {
  const steps = priceSteps(feed, from, slot);
  for (const member of allMembers(shards)) {
    member.week = replaySteps(member.week, memberAccount(member), steps);
  }
}

function fillBot(feed: PriceFeed, member: Member, slot: number) {
  const account = settleDueOrders(memberAccount(member), slot, (order) =>
    quotesAt(feed, order.execution.at),
  );
  member.cash = account.cash;
  member.holdings = account.holdings;
  member.orders = account.orders.filter((order) => order.status === 'pending');
}

/** Copies a real player's position in. Cash held for pending buys still counts as theirs. */
function syncPlayer(shards: Shard[], player: Player, slot: number, quotes: QuoteSource) {
  const account = toAccount(player);
  const cash = player.cash + reservedCash(account);
  const position = { cash, holdings: player.holdings, orders: [] };
  const existing = shards.find((shard) => shard.members[player.uid]);
  const member = existing?.members[player.uid];
  if (member) {
    Object.assign(member, position);
    return;
  }

  const value = portfolioValue(position, quotes);
  let shard = shards.find((s) => Object.keys(s.members).length < SHARD_SIZE);
  if (!shard) {
    shard = { id: String(shards.length), members: {} };
    shards.push(shard);
  }
  shard.members[player.uid] = {
    id: player.uid,
    name: player.name,
    bot: false,
    ...position,
    week: startWeek(slot, value, holdsSecurity(position)),
  };
}

/** Every ranked player, best first. Division moves need all of them, not just the shown rows. */
function rowsOf(members: readonly Member[], quotes: QuoteSource): TableRow[] {
  const byId = new Map(members.map((member) => [member.id, member]));
  const values = new Map(members.map((m) => [m.id, portfolioValue(memberAccount(m), quotes)]));
  const ranked = weeklyTable(
    members.map((m) => ({ id: m.id, week: m.week, value: values.get(m.id) ?? 0 })),
  );
  return ranked.map((row, index) => ({
    ...row,
    rank: index + 1,
    name: byId.get(row.id)?.name ?? '',
    bot: byId.get(row.id)?.bot ?? false,
    value: values.get(row.id) ?? 0,
    division: byId.get(row.id)?.division ?? FIRST_DIVISION,
  }));
}

/** In shekels, so US funds include the dollar's move, the same as a player's return. */
function indexReturns(feed: PriceFeed, weekEndsAt: number, quotes: QuoteSource) {
  const atStart = quotesAt(feed, Math.max(weekStartFor(weekEndsAt), WORLD_START));
  const worth = (source: QuoteSource, id: string) => source(id).price * source(id).fx;
  return Object.fromEntries(
    INDEX_FUNDS.map((id) => {
      const start = worth(atStart, id);
      return [id, partsPerMillion(worth(quotes, id) - start, start)];
    }),
  );
}

function tableOf(
  feed: PriceFeed,
  members: readonly Member[],
  rows: readonly TableRow[],
  quotes: QuoteSource,
  slot: number,
): LeagueTable {
  const weekEndsAt = members[0]?.week.endsAt ?? slot;
  return {
    updatedAt: slot,
    weekEndsAt,
    previousWeekEndsAt: null,
    total: rows.length,
    rows: rows.slice(0, TABLE_ROWS),
    indexes: indexReturns(feed, weekEndsAt, quotes),
  };
}

/** After fills: applies what changed, records values, and closes the week if it just ended. */
export function finishSlot(
  feed: PriceFeed,
  shards: Shard[],
  changed: readonly Player[],
  slot: number,
  previousWeekEndsAt: number | null,
): SlotSave {
  const quotes = quotesAt(feed, slot);
  const members = () => allMembers(shards);

  for (const member of members().filter((m) => m.bot)) fillBot(feed, member, slot);
  for (const player of changed) syncPlayer(shards, player, slot, quotes);

  const record = (member: Member) => {
    const account = memberAccount(member);
    member.week = recordValue(member.week, portfolioValue(account, quotes), holdsSecurity(account));
  };
  members().forEach(record);

  const weekEnded = members().some((member) => member.week.endsAt <= slot);
  let finishedWeek: LeagueTable | undefined;
  if (weekEnded) {
    const rows = rowsOf(members(), quotes);
    const moves = divisionMoves(rows);
    const results = rows.map((row) => ({
      ...row,
      nextDivision: moves.get(row.id) ?? row.division,
    }));
    finishedWeek = tableOf(feed, members(), results, quotes, slot);
    for (const member of members()) {
      const account = memberAccount(member);
      const division = moves.get(member.id);
      if (division) member.division = division;
      member.week = nextWeek(member.week, portfolioValue(account, quotes), holdsSecurity(account));
    }
  }

  for (const member of members().filter((m) => m.bot)) {
    const account = botActs(member, slot, quotes, weekEnded);
    member.cash = account.cash;
    member.orders = account.orders;
  }

  const table = tableOf(feed, members(), rowsOf(members(), quotes), quotes, slot);
  table.previousWeekEndsAt = finishedWeek?.weekEndsAt ?? previousWeekEndsAt;
  return { shards, table, ...(finishedWeek ? { finishedWeek } : {}) };
}
