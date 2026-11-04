import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { OrderTicket } from '@/components/order-ticket';
import { Card, changeColor, colors, ils, percent, SectionTitle } from '@/components/ui';
import {
  cash,
  holdingValue,
  Order,
  orderAmount,
  portfolioValue,
  reservedCash,
  START_SHEKELS,
  toUnits,
} from '@/game/sim';
import { useGame } from '@/game/store';
import { formatWorldTime, Security, SECURITY_BY_ID } from '@/game/world';

function OrderRow({ order }: { order: Order }) {
  const security = SECURITY_BY_ID[order.securityId];
  const pending = order.status === 'pending';
  const detail = pending
    ? order.execution.kind === 'close'
      ? 'Waiting for the close'
      : 'Waiting for the next open'
    : `Filled ${formatWorldTime(order.fill?.at ?? 0)} · ${toUnits(order.fill?.units ?? 0).toFixed(3)} units`;
  return (
    <View style={styles.row}>
      <View style={styles.flex}>
        <Text style={styles.name}>
          {order.side === 'buy' ? 'Buy' : 'Sell'} {security.name}
        </Text>
        <Text style={styles.meta}>{detail}</Text>
      </View>
      <Text style={styles.number}>{ils(orderAmount(order))}</Text>
    </View>
  );
}

export default function PortfolioScreen() {
  const { state } = useGame();
  const [selected, setSelected] = useState<Security | null>(null);

  const total = portfolioValue(state);
  const change = (total / START_SHEKELS - 1) * 100;
  const held = Object.keys(state.account.holdings);
  const newestFirst = [...state.account.orders].reverse();
  const pending = newestFirst.filter((o) => o.status === 'pending');
  const filled = newestFirst.filter((o) => o.status === 'filled');

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <Card>
        <Text style={styles.meta}>Portfolio value</Text>
        <Text style={styles.total}>{ils(total)}</Text>
        <Text style={[styles.change, { color: changeColor(change) }]}>{percent(change)}</Text>
        <View style={styles.split}>
          <View>
            <Text style={styles.meta}>Available cash</Text>
            <Text style={styles.number}>{ils(cash(state))}</Text>
          </View>
          <View>
            <Text style={styles.meta}>Held for pending buys</Text>
            <Text style={styles.number}>{ils(reservedCash(state))}</Text>
          </View>
        </View>
      </Card>

      <SectionTitle>Holdings</SectionTitle>
      <Card style={styles.list}>
        {held.length === 0 ? (
          <Text style={styles.empty}>No holdings yet. Buy something from the Market tab.</Text>
        ) : (
          held.map((id) => {
            const value = holdingValue(state, id);
            return (
              <Pressable
                key={id}
                accessibilityRole="button"
                onPress={() => setSelected(SECURITY_BY_ID[id])}
                style={styles.row}>
                <View style={styles.flex}>
                  <Text style={styles.name}>{SECURITY_BY_ID[id].name}</Text>
                  <Text style={styles.meta}>
                    {toUnits(state.account.holdings[id]).toFixed(3)} units · {((value / total) * 100).toFixed(1)}% of
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

      {selected ? <OrderTicket security={selected} onClose={() => setSelected(null)} /> : null}
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
