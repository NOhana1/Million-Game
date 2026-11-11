import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { MarketData, Position } from '@/api/client';
import { Card, changeColor, colors, font, hover, ils, money, percent, Tile, useWide } from '@/components/ui';
import { displayPrice, findRow, sharesText, toShekels, toUnits } from '@/game/view';

/**
 * One line per stock: what you paid on average, what it costs now, and how much you made or lost
 * since you bought. The return is in the stock's own currency, so a US stock's return doesn't move
 * with the dollar. The profit in shekels is that same return applied to today's value.
 */
type Line = {
  id: string;
  name: string;
  sector: string;
  currency: '₪' | '$';
  shares: number;
  average: number | null;
  now: number;
  value: number;
  gain: number | null;
  profit: number | null;
};

const lineOf = (market: MarketData, position: Position): Line | null => {
  const row = findRow(market, position.securityId);
  if (!row) return null;
  const now = displayPrice(row.price);
  const average = position.averagePrice ? displayPrice(position.averagePrice) : null;
  const value = toShekels(position.value);
  const gain = average ? (now / average - 1) * 100 : null;
  return {
    id: row.id,
    name: row.name,
    sector: row.sector,
    currency: row.market === 'US' ? '$' : '₪',
    shares: toUnits(position.units),
    average,
    now,
    value,
    gain,
    profit: average ? value - (value * average) / now : null,
  };
};

const signedIls = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${ils(Math.abs(n))}`;

export function HoldingsTable({ market, positions }: { market: MarketData; positions: Position[] }) {
  const wide = useWide();
  const lines = positions
    .map((p) => lineOf(market, p))
    .filter((l): l is Line => l !== null)
    .sort((a, b) => b.value - a.value);
  if (lines.length === 0) return null;

  // Totals cover only the stocks we know the buy price of.
  const known = lines.filter((l) => l.profit !== null);
  const profit = known.reduce((sum, l) => sum + (l.profit ?? 0), 0);
  const cost = known.reduce((sum, l) => sum + l.value - (l.profit ?? 0), 0);
  const totalGain = cost > 0 ? (profit / cost) * 100 : 0;

  return (
    <Card style={styles.card}>
      <View style={[styles.row, styles.head]}>
        <Text style={[styles.headText, styles.stock]}>Stock</Text>
        <Text style={[styles.headText, styles.cell]}>Avg. buy</Text>
        <Text style={[styles.headText, styles.cell]}>Now</Text>
        {wide ? <Text style={[styles.headText, styles.cell]}>Value</Text> : null}
        <Text style={[styles.headText, styles.cell]}>Return</Text>
      </View>

      {lines.map((l) => (
        <Pressable
          key={l.id}
          accessibilityRole="button"
          accessibilityLabel={`Open ${l.name}`}
          onPress={() => router.push(`/security/${l.id}`)}
          {...hover('row')}
          style={styles.row}
        >
          <View style={[styles.stock, styles.stockCell]}>
            {wide ? <Tile id={l.id} name={l.name} sector={l.sector} size={32} /> : null}
            <View style={styles.flex}>
              <Text numberOfLines={1} style={styles.name}>
                {l.name}
              </Text>
              <Text style={styles.small}>{sharesText(l.shares)} shares</Text>
            </View>
          </View>
          <Text style={[styles.number, styles.cell]}>{l.average ? money(l.average, l.currency) : '—'}</Text>
          <Text style={[styles.number, styles.cell]}>{money(l.now, l.currency)}</Text>
          {wide ? <Text style={[styles.number, styles.cell]}>{ils(l.value)}</Text> : null}
          <View style={styles.cell}>
            {l.gain === null ? (
              <Text style={styles.small}>—</Text>
            ) : (
              <>
                <Text style={[styles.gain, { color: changeColor(l.gain) }]}>{percent(l.gain)}</Text>
                <Text style={[styles.small, styles.right, { color: changeColor(l.gain) }]}>
                  {signedIls(l.profit ?? 0)}
                </Text>
              </>
            )}
          </View>
        </Pressable>
      ))}

      {known.length > 0 ? (
        <View style={[styles.row, styles.total]}>
          <Text style={[styles.name, styles.stock]}>All stocks</Text>
          <View style={styles.cell}>
            <Text style={[styles.gain, { color: changeColor(totalGain) }]}>{percent(totalGain)}</Text>
            <Text style={[styles.small, styles.right, { color: changeColor(totalGain) }]}>
              {signedIls(profit)}
            </Text>
          </View>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { paddingHorizontal: 16, paddingVertical: 6 },
  flex: { flex: 1, minWidth: 0 },
  row: {
    alignItems: 'center',
    borderBottomColor: colors.line,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 10,
  },
  head: { paddingVertical: 8 },
  headText: {
    color: colors.muted,
    fontFamily: font.body,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  total: { borderBottomWidth: 0, justifyContent: 'space-between' },
  stock: { flex: 1.6, minWidth: 0 },
  stockCell: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  cell: { alignItems: 'flex-end', flex: 1, textAlign: 'right' },
  right: { textAlign: 'right' },
  name: { color: colors.ink, fontFamily: font.body, fontSize: 15, fontWeight: '500' },
  small: { color: colors.muted, fontFamily: font.body, fontSize: 12, marginTop: 2 },
  number: { color: colors.ink, fontFamily: font.body, fontSize: 14, fontVariant: ['tabular-nums'] },
  gain: { fontFamily: font.body, fontSize: 14, fontVariant: ['tabular-nums'], fontWeight: '600' },
});
