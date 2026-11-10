import type { Market } from '@portfolio-league/engine';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { api, LeagueRow, LeagueTable, MarketData, MarketRow } from '@/api/client';
import { DivisionTag } from '@/components/division-badge';
import { GoalBar } from '@/components/goal';
import { MarketCompare, WeekSummary } from '@/components/league-cards';
import { OrderTicket } from '@/components/order-ticket';
import { TodayCard } from '@/components/today-card';
import { RecapCard } from '@/components/recap-card';
import { Spark } from '@/components/spark';
import { NewsStrip } from '@/components/news-strip';
import { Ticker } from '@/components/ticker';
import { WatchStar } from '@/components/watch-star';
import {
  changeColor,
  colors,
  Eyebrow,
  font,
  Hero,
  hover,
  ils,
  money,
  Page,
  percent,
  Pill,
  Segments,
  Tile,
  useWide,
} from '@/components/ui';
import { useGame } from '@/game/store';
import { useLeague } from '@/game/use-league';
import { dayChange, displayFx, displayPrice, MARKET_LABEL, marketsText, toShekels } from '@/game/view';

type Filter = 'all' | 'watching' | Market;
type Sort = 'name' | 'gainers' | 'losers';

const SORTS: Record<Sort, (a: MarketRow, b: MarketRow) => number> = {
  name: (a, b) => a.name.localeCompare(b.name),
  gainers: (a, b) => dayChange(b) - dayChange(a),
  losers: (a, b) => dayChange(a) - dayChange(b),
};

const MOVERS = 3;
const SPARKS_EVERY_MS = 120_000;
const namePart = { dataSet: { hoverPart: 'name' } } as object;
const openPage = (id: string) => router.push(`/security/${id}`);

function CashHero({ table, row }: { table: LeagueTable | null; row?: LeagueRow }) {
  const { me, world } = useGame();
  const wide = useWide();
  if (!me || !world) return null;
  const waiting = me.reserved > 0 ? (
    <Text style={styles.heroLabel}>{ils(toShekels(me.reserved))} is waiting in your orders</Text>
  ) : null;

  // On a phone this panel never scrolls away, so it has to stay small.
  if (!wide) {
    return (
      <Hero style={styles.heroPhone}>
        <View style={styles.heroPhoneTop}>
          <View style={styles.names}>
            <Eyebrow>You can spend</Eyebrow>
            <Text numberOfLines={1} style={styles.cashPhone}>{ils(toShekels(me.cash))}</Text>
          </View>
          <View style={styles.heroPhoneSide}>
            {row ? <DivisionTag onDark division={row.division} /> : null}
            {row && table ? <Text style={styles.heroSmall}>#{row.rank} of {table.total}</Text> : null}
            <Text style={styles.heroSmall}>{marketsText(world)}</Text>
          </View>
        </View>
        {waiting}
        <GoalBar />
      </Hero>
    );
  }

  return (
    <Hero style={styles.hero}>
      <Eyebrow>You can spend</Eyebrow>
      <Text numberOfLines={1} style={styles.cash}>{ils(toShekels(me.cash))}</Text>
      {waiting}
      <View style={styles.pills}>
        {row ? <DivisionTag onDark division={row.division} /> : null}
        {row && table ? <Pill bright label={`#${row.rank} of ${table.total} this week`} /> : null}
        <Pill label={marketsText(world)} />
      </View>
      <GoalBar />
    </Hero>
  );
}

/** One line in the movers panel: the code, the name, the last days and today's change. */
function Mover({ item, spark }: { item: MarketRow; spark?: number[] }) {
  const wide = useWide();
  const change = dayChange(item);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${item.name}`}
      onPress={() => openPage(item.id)}
      {...hover('row')}
      style={styles.mover}>
      <Text style={styles.moverId}>{item.id}</Text>
      <Text style={[styles.meta, styles.moverName]} numberOfLines={1} {...namePart}>
        {item.name}
      </Text>
      {/* On a phone the name needs the room more than the mini chart does. */}
      {wide ? <Spark prices={spark} width={56} height={20} /> : null}
      <Text style={[styles.moverChange, { color: changeColor(change) }]}>{percent(change)}</Text>
    </Pressable>
  );
}

function SecurityRow({
  item,
  spark,
  onBuy,
}: {
  item: MarketRow;
  spark?: number[];
  onBuy: () => void;
}) {
  const wide = useWide();
  const change = dayChange(item);
  return (
    <View {...hover('row')} style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${item.name}`}
        onPress={() => openPage(item.id)}
        style={({ pressed }) => [styles.rowLink, pressed && styles.pressed]}>
        <Tile id={item.id} name={item.name} size={wide ? 42 : 38} />
        <View style={styles.names}>
          <Text style={styles.name} numberOfLines={wide ? 1 : 2} {...namePart}>
            {item.name}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {item.sector} · {MARKET_LABEL[item.market]}
          </Text>
        </View>
        {/* On a phone the name needs the room more than the mini chart does. */}
        {wide ? <Spark prices={spark} width={132} height={34} /> : null}
        <View style={wide ? styles.pricesWide : styles.prices}>
          <Text style={styles.price}>{money(displayPrice(item.price), item.market === 'US' ? '$' : '₪')}</Text>
          <Text style={[styles.change, { color: changeColor(change) }]}>{percent(change)}</Text>
        </View>
      </Pressable>
      <WatchStar id={item.id} name={item.name} />
      {wide ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Buy ${item.name}`}
          onPress={onBuy}
          {...hover('buy')}
          style={styles.buy}>
          <Text style={styles.buyText}>Buy</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function Movers({ market, sparks }: { market: MarketData; sparks: Record<string, number[]> }) {
  const wide = useWide();
  const ranked = [...market.securities].sort((a, b) => dayChange(b) - dayChange(a));
  // One panel with two short lists, instead of six boxes that all look the same.
  // Only what really moved: a flat 0.00% isn't "strongest", for example while the US is closed.
  const columns = [
    {
      title: 'Strongest today',
      items: ranked.filter((item) => dayChange(item) > 0).slice(0, MOVERS),
      none: 'Nothing is up yet today.',
    },
    {
      title: 'Weakest today',
      items: ranked.filter((item) => dayChange(item) < 0).slice(-MOVERS).reverse(),
      none: 'Nothing is down yet today.',
    },
  ];
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Biggest moves today</Text>
      <View style={[styles.movers, wide && styles.moversWide]}>
        {columns.map((column, index) => (
          <View key={column.title} style={[styles.moverColumn, index > 0 && (wide ? styles.moverSplitWide : styles.moverSplit)]}>
            <Text style={styles.moverTitle}>{column.title}</Text>
            {column.items.length === 0 ? <Text style={[styles.meta, styles.moverNone]}>{column.none}</Text> : null}
            {column.items.map((item) => (
              <Mover key={item.id} item={item} spark={sparks[item.id]} />
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

function useSparks() {
  const [sparks, setSparks] = useState<Record<string, number[]>>({});
  useEffect(() => {
    const load = () => api.sparks().then(setSparks).catch(() => undefined);
    load();
    const timer = setInterval(load, SPARKS_EVERY_MS);
    return () => clearInterval(timer);
  }, []);
  return sparks;
}

export default function MarketScreen() {
  const { market, me, join } = useGame();
  const { table, previous } = useLeague();
  const wide = useWide();
  const sparks = useSparks();
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('name');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (!market) return <ActivityIndicator style={styles.page} color={colors.brand} />;

  const wanted = query.trim().toLowerCase();
  const shown = market.securities
    .filter((x) =>
      filter === 'watching' ? me?.watchlist?.includes(x.id) : filter === 'all' || x.market === filter,
    )
    .filter((x) => `${x.name} ${x.id} ${x.sector}`.toLowerCase().includes(wanted))
    .sort(SORTS[sort]);
  const selected = market.securities.find((x) => x.id === selectedId);
  const row = table?.rows.find((r) => r.id === me?.uid);
  const cash = <CashHero table={table} row={row} />;

  return (
    <View style={styles.page}>
      <Ticker market={market} />
      <NewsStrip />
      {/* On a phone the cash sits outside the scrolling part, so it stays in view. */}
      {wide ? null : cash}
      <Page>
        <WeekSummary previous={previous} />
        <TodayCard />
        {wide ? (
          <View style={styles.top}>
            {cash}
            <RecapCard />
          </View>
        ) : (
          <RecapCard />
        )}
        <Movers market={market} sparks={sparks} />
        <MarketCompare table={table} row={row} />
        <View style={styles.section}>
          <View style={styles.filter}>
            <Text style={styles.sectionTitle}>All securities</Text>
            <View style={styles.filterRight}>
              <Text style={styles.meta}>$1 = ₪{displayFx(market.usdIls).toFixed(3)}</Text>
              <Segments
                value={filter}
                onChange={setFilter}
                options={[
                  { value: 'all', label: 'All' },
                  { value: 'watching', label: 'Watching' },
                  { value: 'TASE', label: 'Tel Aviv' },
                  { value: 'US', label: 'US' },
                ]}
              />
            </View>
          </View>
          <View style={styles.tools}>
            <TextInput
              accessibilityLabel="Search securities"
              onChangeText={setQuery}
              placeholder="Search by name or sector"
              placeholderTextColor={colors.muted}
              style={styles.search}
              value={query}
            />
            <Segments
              value={sort}
              onChange={setSort}
              options={[
                { value: 'name', label: 'A–Z' },
                { value: 'gainers', label: 'Top gainers' },
                { value: 'losers', label: 'Top losers' },
              ]}
            />
          </View>
          <View style={styles.list}>
            {shown.length === 0 ? (
              <Text style={styles.nothing}>
                {query.trim() === ''
                  ? 'Press the star on any security to watch it here.'
                  : `Nothing matches “${query.trim()}”.`}
              </Text>
            ) : null}
            {shown.map((item) => (
              <SecurityRow
                key={item.id}
                item={item}
                spark={sparks[item.id]}
                onBuy={() => (me ? setSelectedId(item.id) : join())}
              />
            ))}
          </View>
        </View>
      </Page>
      {selected ? <OrderTicket security={selected} onClose={() => setSelectedId(null)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { backgroundColor: colors.page, flex: 1 },
  top: { alignItems: 'flex-end', flexDirection: 'row', gap: 56 },
  hero: { flex: 1.3, gap: 4 },
  heroPhone: {
    borderBottomColor: colors.line,
    borderBottomWidth: 1,
    gap: 2,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  heroPhoneTop: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  heroPhoneSide: { alignItems: 'flex-end', flexShrink: 0, gap: 2 },
  heroSmall: { color: colors.onDeep, fontFamily: font.body, fontSize: 12 },
  heroLabel: { color: colors.onDeep, fontFamily: font.body, fontSize: 14 },
  cash: {
    color: colors.ink,
    fontFamily: font.display,
    fontSize: 64,
    fontVariant: ['tabular-nums'],
    fontWeight: '400',
    lineHeight: 76,
  },
  cashPhone: {
    color: colors.ink,
    fontFamily: font.display,
    fontSize: 32,
    fontVariant: ['tabular-nums'],
    fontWeight: '400',
    lineHeight: 38,
  },
  pills: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 },
  section: { gap: 12 },
  sectionTitle: { color: colors.ink, fontFamily: font.display, fontSize: 24, fontWeight: '500' },
  movers: { borderColor: colors.line, borderRadius: 4, borderWidth: 1 },
  moversWide: { flexDirection: 'row' },
  moverColumn: { flex: 1, paddingVertical: 6 },
  moverSplit: { borderTopColor: colors.line, borderTopWidth: 1 },
  moverSplitWide: { borderLeftColor: colors.line, borderLeftWidth: 1 },
  moverTitle: {
    color: colors.muted,
    fontFamily: font.body,
    fontSize: 13,
    fontWeight: '500',
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  mover: { alignItems: 'center', flexDirection: 'row', gap: 12, paddingHorizontal: 14, paddingVertical: 9 },
  moverId: {
    color: colors.ink,
    fontFamily: font.body,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
    width: 46,
  },
  moverName: { flex: 1 },
  moverNone: { paddingHorizontal: 14, paddingVertical: 9 },
  moverChange: {
    fontFamily: font.body,
    fontSize: 15,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
    textAlign: 'right',
    width: 72,
  },
  filter: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
  },
  filterRight: { alignItems: 'center', flexDirection: 'row', gap: 14 },
  tools: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  search: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: 4,
    borderWidth: 1,
    color: colors.ink,
    flexBasis: 240,
    flexGrow: 1,
    fontFamily: font.body,
    fontSize: 15,
    minHeight: 44,
    outlineColor: colors.brand,
    paddingHorizontal: 12,
  },
  nothing: { color: colors.muted, fontFamily: font.body, fontSize: 14, paddingVertical: 16 },
  list: { borderTopColor: colors.line, borderTopWidth: 1 },
  row: {
    alignItems: 'center',
    borderBottomColor: colors.line,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 14,
    paddingHorizontal: 8,
  },
  rowLink: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 14,
    minHeight: 68,
    minWidth: 0,
    paddingVertical: 10,
  },
  pressed: { opacity: 0.7 },
  names: { flex: 1, minWidth: 0 },
  name: { color: colors.ink, fontFamily: font.body, fontSize: 15, fontWeight: '500' },
  meta: { color: colors.muted, fontFamily: font.body, fontSize: 13, marginTop: 2 },
  prices: { alignItems: 'flex-end' },
  pricesWide: { alignItems: 'center', flexDirection: 'row', gap: 32 },
  price: {
    color: colors.ink,
    fontFamily: font.body,
    fontSize: 15,
    fontVariant: ['tabular-nums'],
    fontWeight: '500',
    minWidth: 84,
    textAlign: 'right',
  },
  change: {
    fontFamily: font.body,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
    minWidth: 76,
    textAlign: 'right',
  },
  buy: {
    alignItems: 'center',
    borderColor: colors.deepSoft,
    borderRadius: 3,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 34,
    minWidth: 56,
  },
  buyText: { color: colors.ink, fontFamily: font.body, fontSize: 13, fontWeight: '600' },
});
