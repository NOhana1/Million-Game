import type { Order } from '@portfolio-league/engine';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { OrderTicket } from '@/components/order-ticket';
import {
  Button,
  Card,
  changeColorOnPlum,
  colors,
  font,
  Hero,
  ils,
  Page,
  percent,
  sectorColor,
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

  if (!me || !market) return <ActivityIndicator style={styles.page} color={colors.brand} />;

  const total = toShekels(me.value);
  const cash = toShekels(me.cash + me.reserved);
  const change = (total / START_SHEKELS - 1) * 100;
  const pending = orders.filter((o) => o.status === 'pending');
  const filled = orders.filter((o) => o.status === 'filled');
  const selected = selectedId ? findRow(market, selectedId) : undefined;

  const side = [styles.column, wide && styles.flex];

  const holdings = (
    <View style={side}>
      <SectionTitle>Holdings</SectionTitle>
      <Card style={styles.list}>
        {me.positions.length === 0 ? (
          <Text style={styles.empty}>No holdings yet. Buy something from the Market tab.</Text>
        ) : (
          me.positions.map(({ securityId, units, value: agorot }) => {
            const value = toShekels(agorot);
            const row = findRow(market, securityId);
            return (
              <Pressable
                key={securityId}
                accessibilityRole="button"
                accessibilityLabel={`Trade ${row?.name}`}
                onPress={() => setSelectedId(securityId)}
                style={styles.row}>
                {row ? <Tile name={row.name} sector={row.sector} size={36} /> : null}
                <View style={styles.flex}>
                  <Text style={styles.name}>{row?.name}</Text>
                  <Text style={styles.meta}>
                    {toUnits(units).toFixed(1)} units · {((value / total) * 100).toFixed(1)}%
                  </Text>
                </View>
                <Text style={styles.number}>{ils(value)}</Text>
              </Pressable>
            );
          })
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
          <Text style={[styles.change, { color: changeColorOnPlum(change) }]}>
            {percent(change)} since you started
          </Text>

          <View style={styles.bar}>
            {me.positions.map(({ securityId, value }) => (
              <View
                key={securityId}
                style={{
                  backgroundColor: sectorColor(findRow(market, securityId)?.sector ?? ''),
                  flex: value,
                }}
              />
            ))}
            <View style={[styles.barCash, { flex: me.cash + me.reserved }]} />
          </View>

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
          {holdings}
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
  heroLabel: { color: colors.onPlum, fontFamily: font.body, fontSize: 14 },
  heroNumber: {
    color: '#FFFFFF',
    fontFamily: font.body,
    fontSize: 16,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
    marginTop: 2,
  },
  total: {
    color: '#FFFFFF',
    fontFamily: font.display,
    fontSize: 46,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
    lineHeight: 54,
  },
  change: { fontFamily: font.body, fontSize: 15, fontWeight: '600' },
  bar: {
    backgroundColor: colors.plumSoft,
    borderRadius: 6,
    flexDirection: 'row',
    gap: 2,
    height: 12,
    marginTop: 14,
    overflow: 'hidden',
  },
  barCash: { backgroundColor: colors.plumSoft },
  split: { columnGap: 28, flexDirection: 'row', flexWrap: 'wrap', marginTop: 14, rowGap: 10 },
  columns: { alignItems: 'flex-start', flexDirection: 'row', gap: 16 },
  column: { gap: 10, width: '100%' },
  list: { paddingVertical: 6 },
  row: { alignItems: 'center', flexDirection: 'row', gap: 10, paddingVertical: 9 },
  name: { color: colors.ink, fontFamily: font.body, fontSize: 15, fontWeight: '600' },
  meta: { color: colors.muted, fontFamily: font.body, fontSize: 13, marginTop: 2 },
  number: {
    color: colors.ink,
    fontFamily: font.body,
    fontSize: 15,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
  },
  empty: { color: colors.muted, fontFamily: font.body, fontSize: 14, paddingVertical: 10 },
  signOut: { marginTop: 12 },
});
