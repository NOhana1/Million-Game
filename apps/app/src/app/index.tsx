import type { Market } from '@portfolio-league/engine';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import type { MarketRow } from '@/api/client';
import { OrderTicket } from '@/components/order-ticket';
import { RecapCard } from '@/components/recap-card';
import {
  changeColor,
  colors,
  font,
  Hero,
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
import { displayFx, displayPrice, marketsText, toShekels } from '@/game/view';

type Filter = 'all' | Market;

function CashHero() {
  const { me, world } = useGame();
  const { table } = useLeague();
  if (!me || !world) return null;
  const row = table?.rows.find((r) => r.id === me.uid);
  return (
    <Hero style={styles.hero}>
      <Text style={styles.heroLabel}>You can spend</Text>
      <Text style={styles.cash}>{ils(toShekels(me.cash))}</Text>
      {me.reserved > 0 ? (
        <Text style={styles.heroLabel}>{ils(toShekels(me.reserved))} is waiting in your orders</Text>
      ) : null}
      <View style={styles.pills}>
        {row && table ? <Pill bright label={`#${row.rank} of ${table.total} this week`} /> : null}
        <Pill label={marketsText(world)} />
      </View>
    </Hero>
  );
}

function SecurityRow({ item, onPress }: { item: MarketRow; onPress: () => void }) {
  const wide = useWide();
  const change = (item.price / item.priceDayAgo - 1) * 100;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Trade ${item.name}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, wide && styles.rowWide, pressed && styles.pressed]}>
      <Tile name={item.name} sector={item.sector} />
      <View style={styles.names}>
        <Text style={styles.name} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {money(displayPrice(item.price), item.market === 'US' ? '$' : '₪')}{' '}
          <Text style={[styles.change, { color: changeColor(change) }]}>{percent(change)}</Text>
        </Text>
      </View>
      <View style={styles.buy}>
        <Text style={styles.buyText}>Buy</Text>
      </View>
    </Pressable>
  );
}

export default function MarketScreen() {
  const { market } = useGame();
  const wide = useWide();
  const [filter, setFilter] = useState<Filter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (!market) return <ActivityIndicator style={styles.page} color={colors.brand} />;

  const shown = market.securities.filter((x) => filter === 'all' || x.market === filter);
  const selected = market.securities.find((x) => x.id === selectedId);

  return (
    <View style={styles.page}>
      {/* On a phone the cash sits outside the scrolling part, so it stays in view. */}
      {wide ? null : (
        <View style={styles.pinned}>
          <CashHero />
        </View>
      )}
      <Page>
        {wide ? (
          <View style={styles.top}>
            <CashHero />
            <RecapCard />
          </View>
        ) : (
          <RecapCard />
        )}
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
  pinned: { paddingHorizontal: 16, paddingTop: 12 },
  top: { flexDirection: 'row', gap: 12 },
  hero: { flex: 1, gap: 2 },
  heroLabel: { color: colors.onPlum, fontFamily: font.body, fontSize: 15 },
  cash: {
    color: '#FFFFFF',
    fontFamily: font.display,
    fontSize: 46,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
    lineHeight: 54,
  },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  filter: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
  },
  list: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 8 },
  row: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 18,
    flexDirection: 'row',
    gap: 10,
    padding: 10,
    width: '100%',
  },
  rowWide: { width: '49.5%' },
  pressed: { backgroundColor: colors.brandSoft },
  names: { flex: 1, minWidth: 0 },
  name: { color: colors.ink, fontFamily: font.body, fontSize: 15, fontWeight: '600' },
  meta: {
    color: colors.muted,
    fontFamily: font.body,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  change: { fontWeight: '600' },
  buy: {
    alignItems: 'center',
    backgroundColor: colors.brandSoft,
    borderRadius: 14,
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 56,
  },
  buyText: { color: colors.brand, fontFamily: font.body, fontSize: 14, fontWeight: '600' },
});
