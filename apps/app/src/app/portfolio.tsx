import type { Order } from '@portfolio-league/engine';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { OrderTicket } from '@/components/order-ticket';
import { Card, changeColor, colors, ils, percent, SectionTitle } from '@/components/ui';
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
  const name = market ? findRow(market, order.securityId)?.name : order.securityId;
  const pending = order.status === 'pending';
  const detail = pending
    ? order.execution.kind === 'close'
      ? 'Waiting for the close'
      : 'Waiting for the next open'
    : `Filled ${formatWorldTime(order.fill?.at ?? 0)} · ${toUnits(order.fill?.units ?? 0).toFixed(3)} units${refundText(order)}`;
  return (
    <View style={styles.row}>
      <View style={styles.flex}>
        <Text style={styles.name}>
          {order.side === 'buy' ? 'Buy' : 'Sell'} {name}
        </Text>
        <Text style={styles.meta}>{detail}</Text>
      </View>
      <Text style={styles.number}>{ils(orderAmount(order))}</Text>
    </View>
  );
}

export default function PortfolioScreen() {
  const { me, market, orders } = useGame();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (!me || !market) return <ActivityIndicator style={styles.page} color={colors.brand} />;

  const total = toShekels(me.value);
  const change = (total / START_SHEKELS - 1) * 100;
  const pending = orders.filter((o) => o.status === 'pending');
  const filled = orders.filter((o) => o.status === 'filled');
  const selected = selectedId ? findRow(market, selectedId) : undefined;

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <Card>
        <Text style={styles.meta}>Portfolio value</Text>
        <Text style={styles.total}>{ils(total)}</Text>
        <Text style={[styles.change, { color: changeColor(change) }]}>{percent(change)}</Text>
        <View style={styles.split}>
          <View>
            <Text style={styles.meta}>Available cash</Text>
            <Text style={styles.number}>{ils(toShekels(me.cash))}</Text>
          </View>
          <View>
            <Text style={styles.meta}>Held for pending buys</Text>
            <Text style={styles.number}>{ils(toShekels(me.reserved))}</Text>
          </View>
        </View>
      </Card>

      <SectionTitle>Holdings</SectionTitle>
      <Card style={styles.list}>
        {me.positions.length === 0 ? (
          <Text style={styles.empty}>No holdings yet. Buy something from the Market tab.</Text>
        ) : (
          me.positions.map(({ securityId, units, value: agorot }) => {
            const value = toShekels(agorot);
            return (
              <Pressable
                key={securityId}
                accessibilityRole="button"
                onPress={() => setSelectedId(securityId)}
                style={styles.row}>
                <View style={styles.flex}>
                  <Text style={styles.name}>{findRow(market, securityId)?.name}</Text>
                  <Text style={styles.meta}>
                    {toUnits(units).toFixed(3)} units · {((value / total) * 100).toFixed(1)}% of
                    portfolio
                  </Text>
                </View>
                <Text style={styles.number}>{ils(value)}</Text>
              </Pressable>
            );
          })
        )}
      </Card>

      <SectionTitle>Pending orders</SectionTitle>
      <Card style={styles.list}>
        {pending.length === 0 ? (
          <Text style={styles.empty}>No pending orders.</Text>
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

      {selected ? <OrderTicket security={selected} onClose={() => setSelectedId(null)} /> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { backgroundColor: colors.page, flex: 1 },
  content: { padding: 16 },
  flex: { flex: 1 },
  total: {
    color: colors.ink,
    fontSize: 32,
    fontVariant: ['tabular-nums'],
    fontWeight: '800',
    marginTop: 2,
  },
  change: { fontSize: 15, fontVariant: ['tabular-nums'], fontWeight: '600', marginTop: 2 },
  split: { flexDirection: 'row', gap: 32, marginTop: 14 },
  list: { paddingVertical: 4 },
  row: { alignItems: 'center', flexDirection: 'row', gap: 12, paddingVertical: 10 },
  name: { color: colors.ink, fontSize: 15, fontWeight: '600' },
  meta: { color: colors.muted, fontSize: 13, marginTop: 2 },
  number: { color: colors.ink, fontSize: 15, fontVariant: ['tabular-nums'], fontWeight: '600' },
  empty: { color: colors.muted, fontSize: 14, paddingVertical: 10 },
});
