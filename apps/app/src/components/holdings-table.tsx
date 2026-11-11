import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { MarketData, Position } from '@/api/client';
import { Card, changeColor, colors, font, hover, ils, money, percent, Tile, useWide } from '@/components/ui';
import { displayPrice, findRow, sharesText, toShekels, toUnits } from '@/game/view';

/**
 * One line per stock: what you paid on average, what it costs now, how it moved today, and how much
 * you made or lost since you bought. Percent changes are in the stock's own currency, so a US
 * stock's numbers don't move with the dollar. The shekel amounts apply that change to today's value.
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
  today: number;
  todayIls: number;
  gain: number | null;
  profit: number | null;
};

/** The shekels a value of `value` gained while its price went from `from` to `to`. */
const moved = (value: number, from: number, to: number) =>
  from > 0 && to > 0 ? value - (value * from) / to : 0;

const lineOf = (market: MarketData, position: Position): Line | null => {
  const row = findRow(market, position.securityId);
  if (!row) return null;
  const now = displayPrice(row.price);
  const dayAgo = displayPrice(row.priceDayAgo);
  const average = position.averagePrice ? displayPrice(position.averagePrice) : null;
  const value = toShekels(position.value);
  return {
    id: row.id,
    name: row.name,
    sector: row.sector,
    currency: row.market === 'US' ? '$' : '₪',
    shares: toUnits(position.units),
    average,
    now,
    value,
    today: dayAgo > 0 ? (now / dayAgo - 1) * 100 : 0,
    todayIls: moved(value, dayAgo, now),
    gain: average ? (now / average - 1) * 100 : null,
    profit: average ? moved(value, average, now) : null,
  };
};

/** How much all your stocks together moved today, in shekels and percent. */
export function stocksToday(market: MarketData, positions: Position[]) {
  const lines = positions.map((p) => lineOf(market, p)).filter((l): l is Line => l !== null);
  const ils = lines.reduce((sum, l) => sum + l.todayIls, 0);
  const value = lines.reduce((sum, l) => sum + l.value, 0);
  return { ils, percent: value - ils > 0 ? (ils / (value - ils)) * 100 : 0 };
}

const signedIls = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${ils(Math.abs(n))}`;

function Change({ pct, amount }: { pct: number; amount: number }) {
  const color = changeColor(pct);
  return (
    <View style={styles.cell}>
      <Text style={[styles.gain, { color }]}>{percent(pct)}</Text>
      <Text style={[styles.small, styles.right, { color }]}>{signedIls(amount)}</Text>
    </View>
  );
}

export function HoldingsTable({ market, positions }: { market: MarketData; positions: Position[] }) {
  const wide = useWide();
  const lines = positions
    .map((p) => lineOf(market, p))
    .filter((l): l is Line => l !== null)
    .sort((a, b) => b.value - a.value);
  if (lines.length === 0) return null;

  const today = stocksToday(market, positions);
  // "Since you bought" covers only the stocks we know the buy price of.
  const known = lines.filter((l) => l.profit !== null);
  const profit = known.reduce((sum, l) => sum + (l.profit ?? 0), 0);
  const cost = known.reduce((sum, l) => sum + l.value - (l.profit ?? 0), 0);
  const totalGain = cost > 0 ? (profit / cost) * 100 : 0;

  return (
    <Card style={styles.card}>
      <Text style={styles.help}>
        <Text style={styles.helpStrong}>You paid</Text> is your average price per share.{' '}
        <Text style={styles.helpStrong}>Today</Text> is the move since yesterday.{' '}
        <Text style={styles.helpStrong}>Since you bought</Text> is your profit or loss.
      </Text>

      <View style={[styles.row, styles.head]}>
        <Text style={[styles.headText, styles.stock]}>Stock</Text>
        {wide ? (
          <>
            <Text style={[styles.headText, styles.cell]}>You paid</Text>
            <Text style={[styles.headText, styles.cell]}>Price now</Text>
            <Text style={[styles.headText, styles.cell]}>Value</Text>
          </>
        ) : (
          <Text style={[styles.headText, styles.cell]}>Price</Text>
        )}
        <Text style={[styles.headText, styles.cell]}>Today</Text>
        <Text style={[styles.headText, styles.cell]}>Since you bought</Text>
      </View>

      {lines.map((l) => {
        const paid = l.average ? money(l.average, l.currency) : '—';
        const now = money(l.now, l.currency);
        return (
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
                <Text style={styles.small}>
                  {sharesText(l.shares)} shares{wide ? '' : ` · ${ils(l.value)}`}
                </Text>
              </View>
            </View>
            {wide ? (
              <>
                <Text style={[styles.number, styles.cell]}>{paid}</Text>
                <Text style={[styles.number, styles.cell]}>{now}</Text>
                <Text style={[styles.number, styles.cell]}>{ils(l.value)}</Text>
              </>
            ) : (
              // On a phone, both prices share one column: now on top, what you paid under it.
              <View style={styles.cell}>
                <Text style={[styles.number, styles.right]}>{now}</Text>
                <Text style={[styles.small, styles.right]}>paid {paid}</Text>
              </View>
            )}
            <Change pct={l.today} amount={l.todayIls} />
            {l.gain === null ? (
              <Text style={[styles.small, styles.cell]}>—</Text>
            ) : (
              <Change pct={l.gain} amount={l.profit ?? 0} />
            )}
          </Pressable>
        );
      })}

      <View style={[styles.row, styles.total]}>
        <Text style={[styles.name, styles.stock]}>All stocks</Text>
        {wide ? (
          <>
            <View style={styles.cell} />
            <View style={styles.cell} />
            <Text style={[styles.number, styles.cell, styles.bold]}>
              {ils(lines.reduce((sum, l) => sum + l.value, 0))}
            </Text>
          </>
        ) : (
          <View style={styles.cell} />
        )}
        <Change pct={today.percent} amount={today.ils} />
        {known.length > 0 ? <Change pct={totalGain} amount={profit} /> : <View style={styles.cell} />}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { paddingHorizontal: 16, paddingVertical: 6 },
  flex: { flex: 1, minWidth: 0 },
  help: { color: colors.muted, fontFamily: font.body, fontSize: 13, lineHeight: 19, paddingVertical: 8 },
  helpStrong: { color: colors.ink, fontWeight: '600' },
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
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  total: { borderBottomWidth: 0 },
  stock: { flex: 1.5, minWidth: 0 },
  stockCell: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  cell: { alignItems: 'flex-end', flex: 1, textAlign: 'right' },
  right: { textAlign: 'right' },
  bold: { fontWeight: '600' },
  name: { color: colors.ink, fontFamily: font.body, fontSize: 15, fontWeight: '500' },
  small: { color: colors.muted, fontFamily: font.body, fontSize: 12, marginTop: 2 },
  number: { color: colors.ink, fontFamily: font.body, fontSize: 14, fontVariant: ['tabular-nums'] },
  gain: { fontFamily: font.body, fontSize: 14, fontVariant: ['tabular-nums'], fontWeight: '600' },
});
