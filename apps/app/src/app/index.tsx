import type { Market } from '@portfolio-league/engine';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { api, LeagueRow, LeagueTable, MarketData, MarketRow } from '@/api/client';
import { DivisionTag } from '@/components/division-badge';
import { GoalBar } from '@/components/goal';
import { MarketCompare, WeekResult } from '@/components/league-cards';
import { OrderTicket } from '@/components/order-ticket';
import { RecapCard } from '@/components/recap-card';
import { Spark } from '@/components/spark';
import { Ticker } from '@/components/ticker';
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

type Filter = 'all' | Market;

const MOVERS = 3;
const SPARKS_EVERY_MS = 120_000;
const namePart = { dataSet: { hoverPart: 'name' } } as object;
const openPage = (id: string) => router.push(`/security/${id}`);

function CashHero({ table, row }: { table: LeagueTable | null; row?: LeagueRow }) {
  const { me, world } = useGame();
  const wide = useWide();
  if (!me || !world) return null;
  return (
    <Hero style={wide ? styles.hero : styles.heroPhone}>
      <Eyebrow>You can spend</Eyebrow>
      <Text numberOfLines={1} style={[styles.cash, !wide && styles.cashPhone]}>{ils(toShekels(me.cash))}</Text>
      {me.reserved > 0 ? (
        <Text style={styles.heroLabel}>{ils(toShekels(me.reserved))} is waiting in your orders</Text>
      ) : null}
      <View style={styles.pills}>
        {row ? <DivisionTag onDark division={row.division} /> : null}
        {row && table ? <Pill bright label={`#${row.rank} of ${table.total} this week`} /> : null}
        <Pill label={marketsText(world)} />
      </View>
      <GoalBar />
    </Hero>
  );
}

function Mover({ item, spark }: { item: MarketRow; spark?: number[] }) {
  const change = dayChange(item);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${item.name}`}
      onPress={() => openPage(item.id)}
      {...hover('lift')}
      style={styles.mover}>
      <View style={styles.moverTop}>
        <Eyebrow>{item.id}</Eyebrow>
        <Spark prices={spark} width={64} height={22} />
      </View>
      <Text style={[styles.moverChange, { color: changeColor(change) }]}>{percent(change)}</Text>
      <Text style={styles.meta} numberOfLines={1}>
        {item.name}
      </Text>
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
        <Tile name={item.name} size={wide ? 42 : 38} />
        <View style={styles.names}>
          <Text style={styles.name} numberOfLines={1} {...namePart}>
            {item.name}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {item.sector} · {MARKET_LABEL[item.market]}
          </Text>
        </View>
        <Spark prices={spark} width={wide ? 132 : 52} height={wide ? 34 : 26} />
        <View style={wide ? styles.pricesWide : styles.prices}>
          <Text style={styles.price}>{money(displayPrice(item.price), item.market === 'US' ? '$' : '₪')}</Text>
          <Text style={[styles.change, { color: changeColor(change) }]}>{percent(change)}</Text>
        </View>
      </Pressable>
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
  const ranked = [...market.securities].sort((a, b) => dayChange(b) - dayChange(a));
  const shown = [...ranked.slice(0, MOVERS), ...ranked.slice(-MOVERS)];
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Biggest moves today</Text>
      <View style={styles.movers}>
        {shown.map((item) => (
          <Mover key={item.id} item={item} spark={sparks[item.id]} />
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
  const { market, me } = useGame();
  const { table, previous } = useLeague();
  const wide = useWide();
  const sparks = useSparks();
  const [filter, setFilter] = useState<Filter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (!market) return <ActivityIndicator style={styles.page} color={colors.brand} />;

  const shown = market.securities.filter((x) => filter === 'all' || x.market === filter);
  const selected = market.securities.find((x) => x.id === selectedId);
  const row = table?.rows.find((r) => r.id === me?.uid);
  const cash = <CashHero table={table} row={row} />;

  return (
    <View style={styles.page}>
      <Ticker market={market} />
      {/* On a phone the cash sits outside the scrolling part, so it stays in view. */}
      {wide ? null : cash}
      <Page>
        <WeekResult previous={previous} />
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
                  { value: 'TASE', label: 'Tel Aviv' },
                  { value: 'US', label: 'US' },
                ]}
              />
            </View>
          </View>
          <View style={styles.list}>
            {shown.map((item) => (
              <SecurityRow
                key={item.id}
                item={item}
                spark={sparks[item.id]}
                onBuy={() => setSelectedId(item.id)}
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
  heroPhone: { borderBottomColor: colors.line, borderBottomWidth: 1, gap: 2, padding: 16 },
  heroLabel: { color: colors.onDeep, fontFamily: font.body, fontSize: 14 },
  cash: {
    color: colors.ink,
    fontFamily: font.display,
    fontSize: 64,
    fontVariant: ['tabular-nums'],
    fontWeight: '400',
    lineHeight: 76,
  },
  cashPhone: { fontSize: 42, lineHeight: 50 },
  pills: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 },
  section: { gap: 12 },
  sectionTitle: { color: colors.ink, fontFamily: font.display, fontSize: 24, fontWeight: '500' },
  movers: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  mover: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: 4,
    borderWidth: 1,
    flexBasis: '30%',
    flexGrow: 1,
    gap: 6,
    padding: 14,
  },
  moverTop: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  moverChange: {
    fontFamily: font.display,
    fontSize: 24,
    fontVariant: ['tabular-nums'],
    fontWeight: '500',
  },
  filter: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
  },
  filterRight: { alignItems: 'center', flexDirection: 'row', gap: 14 },
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
