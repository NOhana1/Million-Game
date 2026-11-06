import type { Order } from '@portfolio-league/engine';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { HoldingsPie, type Slice } from '@/components/holdings-pie';
import { OrderTicket } from '@/components/order-ticket';
import { SLICE_COLORS } from '@/components/palette';
import {
  Button,
  Card,
  changeColorOnDeep,
  colors,
  font,
  Hero,
  hover,
  ils,
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
  toUnits,
} from '@/game/view';

const refundText = (order: Order) => {
  const refund = orderRefund(order);
  return refund > 0 ? ` · ${ils(refund)} returned (20% limit)` : '';
};

function OrderRow({ order }: { order: Order }) {
  const { market } = useGame();
  const row = market ? findRow(market, order.securityId) : undefined;
  const pending = order.status === 'pending';
  const detail = pending
    ? order.execution.kind === 'close'
      ? 'Waiting for the close'
      : 'Waiting for the next open'
    : `Filled ${formatWorldTime(order.fill?.at ?? 0)} · ${toUnits(order.fill?.units ?? 0).toFixed(3)} units${refundText(order)}`;
  return (
    <View style={styles.row}>
      {row ? <Tile name={row.name} sector={row.sector} size={36} /> : null}
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

export default function PortfolioScreen() {
  const { me, market, orders, signOut } = useGame();
  const wide = useWide();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);

  if (!me || !market) return <ActivityIndicator style={styles.page} color={colors.brand} />;

  const total = toShekels(me.value);
  const cash = toShekels(me.cash + me.reserved);
  const change = (total / START_SHEKELS - 1) * 100;
  const pending = orders.filter((o) => o.status === 'pending');
  const filled = orders.filter((o) => o.status === 'filled');
  const selected = selectedId ? findRow(market, selectedId) : undefined;

  const side = [styles.column, wide && styles.flex];

  const holdings = [...me.positions].sort((a, b) => b.value - a.value);
  const slices: Slice[] = holdings.map(({ securityId, value }, index) => ({
    id: securityId,
    label: findRow(market, securityId)?.name ?? securityId,
    value: toShekels(value),
    color: SLICE_COLORS[index % SLICE_COLORS.length],
    onPress: () => setSelectedId(securityId),
  }));
  if (cash > 0) slices.push({ id: 'cash', label: 'Cash', value: cash, color: colors.line });

  const holdingsCard = (
    <View style={side}>
      <SectionTitle>Holdings</SectionTitle>
      <Card style={styles.list}>
        {holdings.length === 0 ? (
          <Text style={styles.empty}>No holdings yet. Buy something from the Market tab.</Text>
        ) : (
          <>
            <HoldingsPie slices={slices} active={active} onActive={setActive} />
            {slices.map((slice) => {
              const position = holdings.find((p) => p.securityId === slice.id);
              const row = findRow(market, slice.id);
              const look = [styles.row, styles.key, active === slice.id && styles.keyActive];
              const body = (
                <>
                  <View style={[styles.dot, { backgroundColor: slice.color }]} />
                  {row ? <Tile name={row.name} sector={row.sector} size={36} /> : null}
                  <View style={styles.flex}>
                    <Text style={styles.name}>{slice.label}</Text>
                    <Text style={styles.meta}>
                      {position ? `${toUnits(position.units).toFixed(1)} units · ` : ''}
                      {((slice.value / total) * 100).toFixed(1)}%
                    </Text>
                  </View>
                  <Text style={styles.number}>{ils(slice.value)}</Text>
                </>
              );
              return slice.onPress ? (
                <Pressable
                  key={slice.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Trade ${slice.label}`}
                  onPress={slice.onPress}
                  onHoverIn={() => setActive(slice.id)}
                  onHoverOut={() => setActive(null)}
                  onFocus={() => setActive(slice.id)}
                  onBlur={() => setActive(null)}
                  {...hover('row')}
                  style={look}>
                  {body}
                </Pressable>
              ) : (
                <View
                  key={slice.id}
                  onPointerEnter={() => setActive(slice.id)}
                  onPointerLeave={() => setActive(null)}
                  {...hover('line')}
                  style={look}>
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
          <Text style={styles.heroLabel}>Portfolio value</Text>
          <Text style={styles.total}>{ils(total)}</Text>
          <Text style={[styles.change, { color: changeColorOnDeep(change) }]}>
            {percent(change)} since you started
          </Text>

          <View style={styles.split}>
            <View>
              <Text style={styles.heroLabel}>You can spend</Text>
              <Text style={styles.heroNumber}>{ils(toShekels(me.cash))}</Text>
            </View>
            <View>
              <Text style={styles.heroLabel}>In waiting orders</Text>
              <Text style={styles.heroNumber}>{ils(toShekels(me.reserved))}</Text>
            </View>
            <View>
              <Text style={styles.heroLabel}>Invested</Text>
              <Text style={styles.heroNumber}>{ils(total - cash)}</Text>
            </View>
          </View>
        </Hero>

        <View style={wide ? styles.columns : styles.column}>
          {holdingsCard}
          {orderLists}
        </View>

        <View style={styles.signOut}>
          <Button variant="quiet" label="Sign out" onPress={signOut} />
        </View>
      </Page>
      {selected ? (
        <OrderTicket security={selected} startSide="sell" onClose={() => setSelectedId(null)} />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  page: { backgroundColor: colors.page, flex: 1 },
  flex: { flex: 1 },
  hero: { gap: 2 },
  heroLabel: { color: colors.onDeep, fontFamily: font.body, fontSize: 14 },
  heroNumber: {
    color: '#FFFFFF',
    fontFamily: font.body,
    fontSize: 16,
    fontVariant: ['tabular-nums'],
    fontWeight: '500',
    marginTop: 2,
  },
  total: {
    color: '#FFFFFF',
    fontFamily: font.display,
    fontSize: 44,
    fontVariant: ['tabular-nums'],
    fontWeight: '500',
    lineHeight: 52,
  },
  change: { fontFamily: font.body, fontSize: 15, fontWeight: '500' },
  split: { columnGap: 36, flexDirection: 'row', flexWrap: 'wrap', marginTop: 16, rowGap: 10 },
  columns: { alignItems: 'flex-start', flexDirection: 'row', gap: 24 },
  column: { gap: 10, width: '100%' },
  list: { paddingHorizontal: 16, paddingVertical: 12 },
  row: { alignItems: 'center', flexDirection: 'row', gap: 12, paddingVertical: 10 },
  key: { borderRadius: 6, marginHorizontal: -8, paddingHorizontal: 8 },
  keyActive: { backgroundColor: colors.page },
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
  signOut: { alignSelf: 'flex-start', marginTop: 12 },
});
