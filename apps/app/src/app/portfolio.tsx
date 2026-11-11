import type { Order, Side } from '@portfolio-league/engine';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import type { MarketRow } from '@/api/client';
import { HoldingsPie, type Slice } from '@/components/holdings-pie';
import { HoldingsTable, stocksToday } from '@/components/holdings-table';
import { SLICE_COLORS } from '@/components/palette';
import { OrderTicket } from '@/components/order-ticket';
import { PortfolioChart } from '@/components/portfolio-chart';
import {
  Card,
  changeColorOnDeep,
  colors,
  Eyebrow,
  font,
  Hero,
  hover,
  ils,
  money,
  Page,
  percent,
  SectionTitle,
  Tile,
  useWide,
} from '@/components/ui';
import { useGame } from '@/game/store';
import {
  findRow,
  formatWorldTime,
  orderAmount,
  orderRefund,
  START_SHEKELS,
  toShekels,
  sharesText,
  toUnits,
  displayFx,
} from '@/game/view';

const refundText = (order: Order) => {
  const refund = orderRefund(order);
  return refund > 0 ? ` · ${ils(refund)} returned (20% limit)` : '';
};

function OrderRow({ order }: { order: Order }) {
  const { market, world } = useGame();
  const row = market ? findRow(market, order.securityId) : undefined;
  const pending = order.status === 'pending';
  const detail = pending
    ? world && order.execution.at <= world.worldTime
      ? 'Going through now…'
      : order.execution.kind === 'close'
        ? 'Waiting for the close'
        : 'Waiting for the next open'
    : `Filled ${formatWorldTime(order.fill?.at ?? 0)} · ${sharesText(toUnits(order.fill?.units ?? 0))} shares${refundText(order)}`;
  return (
    <View style={styles.row}>
      {row ? <Tile id={row.id} name={row.name} sector={row.sector} size={36} /> : null}
      <View style={styles.flex}>
        <Text style={styles.name}>
          {order.side === 'buy' ? 'Buy' : 'Sell'} {row?.name ?? order.securityId}
        </Text>
        <Text style={styles.meta}>{detail}</Text>
      </View>
      <Text style={styles.number}>{ils(orderAmount(order))}</Text>
    </View>
  );
}

type PieView = 'stocks' | 'currency';
const PIE_VIEWS: { value: PieView; label: string }[] = [
  { value: 'stocks', label: 'By stock' },
  { value: 'currency', label: '₪ / $' },
];

export default function PortfolioScreen() {
  const { me, market, orders } = useGame();
  const wide = useWide();
  const [active, setActive] = useState<string | null>(null);
  const [view, setView] = useState<PieView>('stocks');
  const [ticket, setTicket] = useState<{ row: MarketRow; side: Side } | null>(null);

  if (!me || !market) return <ActivityIndicator style={styles.page} color={colors.brand} />;

  const total = toShekels(me.value);
  const cash = toShekels(me.cash + me.reserved);
  const change = (total / START_SHEKELS - 1) * 100;
  const pending = orders.filter((o) => o.status === 'pending');
  const filled = orders.filter((o) => o.status === 'filled');

  const side = [styles.column, wide && styles.flex];

  const holdings = [...me.positions].sort((a, b) => b.value - a.value);
  const today = stocksToday(market, holdings);
  const slices: Slice[] = holdings.map(({ securityId, value }, index) => ({
    id: securityId,
    label: findRow(market, securityId)?.name ?? securityId,
    value: toShekels(value),
    color: SLICE_COLORS[index % SLICE_COLORS.length],
    onPress: () => router.push(`/security/${securityId}`),
  }));
  if (cash > 0) slices.push({ id: 'cash', label: 'Cash', value: cash, color: colors.cash });

  // The same money, split by currency: Tel Aviv stocks in shekels, US stocks in dollars, and cash,
  // which is always shekels.
  const inMarket = (m: 'TASE' | 'US') => holdings.filter((p) => findRow(market, p.securityId)?.market === m);
  const marketSlice = (m: 'TASE' | 'US', label: string, color: string): Slice[] => {
    const value = toShekels(inMarket(m).reduce((sum, p) => sum + p.value, 0));
    return value > 0 ? [{ id: m, label, value, color }] : [];
  };
  const currencySlices: Slice[] = [
    ...marketSlice('TASE', 'Tel Aviv stocks (₪)', SLICE_COLORS[0]),
    ...marketSlice('US', 'US stocks ($)', SLICE_COLORS[2]),
    ...(cash > 0 ? [{ id: 'cash', label: 'Cash (₪)', value: cash, color: colors.cash }] : []),
  ];
  const shown = view === 'stocks' ? slices : currencySlices;
  const dollars = (shekels: number) => money(shekels / displayFx(market.usdIls), '$');

  const holdingsCard = (
    <View style={side}>
      <View style={styles.titleRow}>
        <SectionTitle>Holdings</SectionTitle>
        {holdings.length > 0 ? (
          <View style={styles.tabs} accessibilityRole="tablist">
            {PIE_VIEWS.map(({ value, label }) => (
              <Pressable
                key={value}
                accessibilityRole="tab"
                accessibilityState={{ selected: view === value }}
                onPress={() => {
                  setView(value);
                  setActive(null);
                }}
                {...hover('lift')}
                style={[styles.tab, view === value && styles.tabOn]}
              >
                <Text style={[styles.tabText, view === value && styles.tabTextOn]}>{label}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
      <Card style={styles.list}>
        {holdings.length === 0 ? (
          <Text style={styles.empty}>No holdings yet. Buy something from the Market tab.</Text>
        ) : (
          <>
            <HoldingsPie slices={shown} active={active} onActive={setActive} />
            {shown.map((slice) => {
              const position = holdings.find((p) => p.securityId === slice.id);
              const row = findRow(market, slice.id);
              const look = [styles.row, styles.key, active === slice.id && styles.keyActive];
              const body = (
                <>
                  <View style={[styles.dot, { backgroundColor: slice.color }]} />
                  {row ? <Tile id={row.id} name={row.name} sector={row.sector} size={36} /> : null}
                  <View style={styles.flex}>
                    <Text style={styles.name}>{slice.label}</Text>
                    <Text style={styles.meta}>
                      {position ? `${sharesText(toUnits(position.units))} shares · ` : ''}
                      {view === 'currency' && slice.id !== 'cash'
                        ? `${inMarket(slice.id as 'TASE' | 'US').length} holdings · `
                        : ''}
                      {((slice.value / total) * 100).toFixed(1)}% of portfolio
                    </Text>
                  </View>
                  <View style={styles.values}>
                    <Text style={styles.number}>{ils(slice.value)}</Text>
                    {row?.market === 'US' || slice.id === 'US' ? (
                      <Text style={styles.meta}>{dollars(slice.value)}</Text>
                    ) : null}
                    {row && position ? (
                      <View style={styles.trade}>
                        {(['buy', 'sell'] as const).map((tradeSide) => (
                          <Pressable
                            key={tradeSide}
                            accessibilityRole="button"
                            accessibilityLabel={`${tradeSide === 'buy' ? 'Buy' : 'Sell'} ${row.name}`}
                            onPress={(event) => {
                              // Only the button: the row itself opens the stock's page.
                              event.stopPropagation();
                              setTicket({ row, side: tradeSide });
                            }}
                            {...hover('lift')}
                            style={[styles.tradeButton, tradeSide === 'buy' && styles.tradeBuy]}
                          >
                            <Text style={[styles.tradeText, tradeSide === 'buy' && styles.tradeBuyText]}>
                              {tradeSide === 'buy' ? 'Buy' : 'Sell'}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    ) : null}
                  </View>
                </>
              );
              return slice.onPress ? (
                <Pressable
                  key={slice.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${slice.label}`}
                  onPress={slice.onPress}
                  onHoverIn={() => setActive(slice.id)}
                  onHoverOut={() => setActive(null)}
                  onFocus={() => setActive(slice.id)}
                  onBlur={() => setActive(null)}
                  {...hover('row')}
                  style={look}
                >
                  {body}
                </Pressable>
              ) : (
                <View
                  key={slice.id}
                  onPointerEnter={() => setActive(slice.id)}
                  onPointerLeave={() => setActive(null)}
                  {...hover('line')}
                  style={look}
                >
                  {body}
                </View>
              );
            })}
          </>
        )}
      </Card>
    </View>
  );

  const orderLists = (
    <View style={side}>
      <SectionTitle>Waiting orders</SectionTitle>
      <Card style={styles.list}>
        {pending.length === 0 ? (
          <Text style={styles.empty}>Nothing waiting.</Text>
        ) : (
          pending.map((o) => <OrderRow key={o.id} order={o} />)
        )}
      </Card>
      {filled.length > 0 ? (
        <>
          <SectionTitle>Filled orders</SectionTitle>
          <Card style={styles.list}>
            {filled.map((o) => (
              <OrderRow key={o.id} order={o} />
            ))}
          </Card>
        </>
      ) : null}
    </View>
  );

  return (
    <>
      <Page>
        <Hero style={styles.hero}>
          <Eyebrow>Portfolio value</Eyebrow>
          <Text numberOfLines={1} style={[styles.total, !wide && styles.totalPhone]}>
            {ils(total)}
          </Text>
          <Text style={[styles.change, { color: changeColorOnDeep(change) }]}>
            {percent(change)} since you started
          </Text>
          {holdings.length > 0 ? (
            <Text style={[styles.change, { color: changeColorOnDeep(today.percent) }]}>
              {percent(today.percent)} ({today.ils < 0 ? '−' : '+'}
              {ils(Math.abs(today.ils))}) today on your stocks
            </Text>
          ) : null}

          <View style={styles.split}>
            <View style={styles.stat}>
              <Eyebrow>You can spend</Eyebrow>
              <Text style={styles.heroNumber}>{ils(toShekels(me.cash))}</Text>
            </View>
            <View style={styles.stat}>
              <Eyebrow>In waiting orders</Eyebrow>
              <Text style={styles.heroNumber}>{ils(toShekels(me.reserved))}</Text>
            </View>
            <View style={styles.stat}>
              <Eyebrow>Invested</Eyebrow>
              <Text style={styles.heroNumber}>{ils(total - cash)}</Text>
            </View>
          </View>
        </Hero>

        <PortfolioChart />

        {holdings.length > 0 ? (
          <View style={styles.column}>
            <SectionTitle>How each stock is doing</SectionTitle>
            <HoldingsTable market={market} positions={holdings} />
          </View>
        ) : null}

        <View style={wide ? styles.columns : styles.column}>
          {holdingsCard}
          {orderLists}
        </View>
      </Page>
      {ticket ? (
        <OrderTicket security={ticket.row} startSide={ticket.side} onClose={() => setTicket(null)} />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
  },
  tabs: {
    borderColor: colors.line,
    borderRadius: 3,
    borderWidth: 1,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  tab: { justifyContent: 'center', minHeight: 36, paddingHorizontal: 14 },
  tabOn: { backgroundColor: colors.brand },
  tabText: { color: colors.muted, fontFamily: font.body, fontSize: 14, fontWeight: '600' },
  tabTextOn: { color: colors.page },
  values: { alignItems: 'flex-end' },
  trade: { flexDirection: 'row', gap: 4, marginTop: 4 },
  tradeButton: {
    alignItems: 'center',
    borderColor: colors.line,
    borderRadius: 3,
    borderWidth: 1,
    justifyContent: 'center',
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  tradeBuy: { backgroundColor: colors.brand, borderColor: colors.brand },
  tradeText: { color: colors.ink, fontFamily: font.body, fontSize: 11, fontWeight: '600' },
  tradeBuyText: { color: colors.page },
  page: { backgroundColor: colors.page, flex: 1 },
  flex: { flex: 1 },
  hero: { gap: 2 },
  heroNumber: {
    color: colors.ink,
    fontFamily: font.body,
    fontSize: 22,
    fontVariant: ['tabular-nums'],
    fontWeight: '500',
    marginTop: 4,
  },
  total: {
    color: colors.ink,
    fontFamily: font.display,
    fontSize: 72,
    fontVariant: ['tabular-nums'],
    fontWeight: '400',
    lineHeight: 84,
  },
  totalPhone: { fontSize: 46, lineHeight: 54 },
  change: { fontFamily: font.body, fontSize: 15, fontWeight: '500' },
  split: {
    borderTopColor: colors.line,
    borderTopWidth: 1,
    columnGap: 48,
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 20,
    paddingTop: 16,
    rowGap: 14,
  },
  stat: { gap: 2 },
  columns: { alignItems: 'flex-start', flexDirection: 'row', gap: 24 },
  column: { gap: 10, width: '100%' },
  list: { paddingHorizontal: 16, paddingVertical: 12 },
  row: { alignItems: 'center', flexDirection: 'row', gap: 12, paddingVertical: 10 },
  key: { borderRadius: 6, marginHorizontal: -8, paddingHorizontal: 8 },
  keyActive: { backgroundColor: colors.raised },
  dot: { borderRadius: 5, height: 10, width: 10 },
  name: { color: colors.ink, fontFamily: font.body, fontSize: 15, fontWeight: '500' },
  meta: { color: colors.muted, fontFamily: font.body, fontSize: 13, marginTop: 2 },
  number: {
    color: colors.ink,
    fontFamily: font.body,
    fontSize: 15,
    fontVariant: ['tabular-nums'],
    fontWeight: '500',
  },
  empty: { color: colors.muted, fontFamily: font.body, fontSize: 14, paddingVertical: 10 },
});
