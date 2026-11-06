import type { Market } from '@portfolio-league/engine';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import type { LeagueRow, LeagueTable, MarketRow } from '@/api/client';
import { DivisionTag } from '@/components/division-badge';
import { GoalBar } from '@/components/goal';
import { MarketCompare, WeekResult } from '@/components/league-cards';
import { OrderTicket } from '@/components/order-ticket';
import { RecapCard } from '@/components/recap-card';
import {
  changeColor,
  colors,
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
import { displayFx, displayPrice, MARKET_LABEL, marketsText, toShekels } from '@/game/view';

type Filter = 'all' | Market;

function CashHero({ table, row }: { table: LeagueTable | null; row?: LeagueRow }) {
  const { me, world } = useGame();
  const wide = useWide();
  if (!me || !world) return null;
  return (
    <Hero style={wide ? styles.hero : styles.heroPhone}>
      <Text style={styles.heroLabel}>You can spend</Text>
      <Text style={styles.cash}>{ils(toShekels(me.cash))}</Text>
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

const buyPart = { dataSet: { hoverPart: 'buy' } } as object;

function SecurityRow({ item, onPress }: { item: MarketRow; onPress: () => void }) {
  const wide = useWide();
  const change = (item.price / item.priceDayAgo - 1) * 100;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Trade ${item.name}`}
      onPress={onPress}
      {...hover('row')}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <Tile name={item.name} sector={item.sector} />
      <View style={styles.names}>
        <Text style={styles.name} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {item.sector} · {MARKET_LABEL[item.market]}
        </Text>
      </View>
      <View style={wide ? styles.pricesWide : styles.prices}>
        <Text style={styles.price}>{money(displayPrice(item.price), item.market === 'US' ? '$' : '₪')}</Text>
        <Text style={[styles.change, { color: changeColor(change) }]}>{percent(change)}</Text>
      </View>
      <View style={styles.buy} {...buyPart}>
        <Text style={styles.buyText}>Buy</Text>
      </View>
    </Pressable>
  );
}

export default function MarketScreen() {
  const { market, me } = useGame();
  const { table, previous } = useLeague();
  const wide = useWide();
  const [filter, setFilter] = useState<Filter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (!market) return <ActivityIndicator style={styles.page} color={colors.brand} />;

  const shown = market.securities.filter((x) => filter === 'all' || x.market === filter);
  const selected = market.securities.find((x) => x.id === selectedId);
  const row = table?.rows.find((r) => r.id === me?.uid);
  const cash = <CashHero table={table} row={row} />;

  return (
    <View style={styles.page}>
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
        <MarketCompare table={table} row={row} />
        <View style={styles.filter}>
          <Segments
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'All' },
              { value: 'TASE', label: 'Tel Aviv' },
              { value: 'US', label: 'US' },
            ]}
          />
          <Text style={styles.meta}>$1 = ₪{displayFx(market.usdIls).toFixed(3)}</Text>
        </View>
        <View style={styles.list}>
          {shown.map((item) => (
            <SecurityRow key={item.id} item={item} onPress={() => setSelectedId(item.id)} />
          ))}
        </View>
      </Page>
      {selected ? <OrderTicket security={selected} onClose={() => setSelectedId(null)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { backgroundColor: colors.page, flex: 1 },
  top: { flexDirection: 'row', gap: 16 },
  hero: { flex: 1, gap: 2 },
  heroPhone: { borderRadius: 0, gap: 2, paddingBottom: 16, paddingHorizontal: 16, paddingTop: 4 },
  heroLabel: { color: colors.onDeep, fontFamily: font.body, fontSize: 14 },
  cash: {
    color: '#FFFFFF',
    fontFamily: font.display,
    fontSize: 44,
    fontVariant: ['tabular-nums'],
    fontWeight: '500',
    lineHeight: 52,
  },
  pills: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 },
  filter: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
    marginTop: 4,
  },
  list: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
  },
  row: {
    alignItems: 'center',
    borderBottomColor: colors.line,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 64,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  pressed: { backgroundColor: colors.brandSoft },
  names: { flex: 1, minWidth: 0 },
  name: { color: colors.ink, fontFamily: font.body, fontSize: 15, fontWeight: '500' },
  meta: { color: colors.muted, fontFamily: font.body, fontSize: 13, marginTop: 2 },
  prices: { alignItems: 'flex-end' },
  pricesWide: { alignItems: 'center', flexDirection: 'row', gap: 40 },
  price: {
    color: colors.ink,
    fontFamily: font.body,
    fontSize: 15,
    fontVariant: ['tabular-nums'],
    fontWeight: '500',
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
    borderColor: colors.line,
    borderRadius: 6,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 36,
    minWidth: 48,
  },
  buyText: { color: colors.ink, fontFamily: font.body, fontSize: 13, fontWeight: '600' },
});
