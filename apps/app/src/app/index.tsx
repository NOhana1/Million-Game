import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { OrderTicket } from '@/components/order-ticket';
import { changeColor, colors, money, percent, Segments } from '@/components/ui';
import { displayPrice } from '@/game/sim';
import { useGame } from '@/game/store';
import { Market, SECURITIES, Security } from '@/game/world';

type Filter = 'all' | Market;

export default function MarketScreen() {
  const { state } = useGame();
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<Security | null>(null);
  const shown = SECURITIES.filter((x) => filter === 'all' || x.market === filter);

  return (
    <View style={styles.page}>
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
      </View>
      <FlatList
        data={shown}
        extraData={state.worldMs}
        keyExtractor={(x) => x.id}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => {
          const price = displayPrice(state, item.id);
          const change = (state.prices[item.id] / state.dayStart[item.id] - 1) * 100;
          return (
            <Pressable
              accessibilityRole="button"
              onPress={() => setSelected(item)}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
              <View style={styles.names}>
                <Text style={styles.name} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.meta}>
                  {item.id} · {item.sector}
                </Text>
              </View>
              <View style={styles.numbers}>
                <Text style={styles.price}>{money(price, item.market === 'US' ? '$' : '₪')}</Text>
                <Text style={[styles.change, { color: changeColor(change) }]}>
                  {percent(change)}
                </Text>
              </View>
            </Pressable>
          );
        }}
      />
      {selected ? <OrderTicket security={selected} onClose={() => setSelected(null)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { backgroundColor: colors.page, flex: 1 },
  filter: { padding: 16, paddingBottom: 10 },
  separator: { backgroundColor: colors.line, height: 1, marginHorizontal: 16 },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  pressed: { backgroundColor: colors.brandSoft },
  names: { flex: 1 },
  name: { color: colors.ink, fontSize: 15, fontWeight: '600' },
  meta: { color: colors.muted, fontSize: 13, marginTop: 2 },
  numbers: { alignItems: 'flex-end' },
  price: { color: colors.ink, fontSize: 15, fontVariant: ['tabular-nums'], fontWeight: '600' },
  change: { fontSize: 13, fontVariant: ['tabular-nums'], marginTop: 2 },
});
