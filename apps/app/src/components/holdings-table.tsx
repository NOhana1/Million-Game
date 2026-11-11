import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { MarketData, Position } from '@/api/client';
import { Card, changeColor, colors, font, hover, ils, money, percent, Tile, useWide } from '@/components/ui';
import { displayPrice, findRow, sharesText, START_SHEKELS, toShekels, toUnits } from '@/game/view';

/**
 * One line per stock: what you paid on average, what it costs now, how it moved today, and how much
 * you made or lost since you bought. Every change is in shekels, so a US stock includes the dollar's
 * move, the same way the portfolio value does. That is what makes the footer add up to the total.
 */
type Line = {
  id: string;
  name: string;
  sector: string;
  currency: '₪' | '$';
  shares: number;
  average: number | null; // per share, in the stock's own currency
  now: number; // per share, in the stock's own currency
  value: number; // ₪ now
  todayIls: number; // ₪ change since a day ago, price and dollar
  today: number; // % of that
  profit: number | null; // ₪ value now minus ₪ paid
  gain: number | null; // % of that
  split: { stock: number; dollar: number } | null; // a US stock's gain, split into price and dollar
};

const pct = (change: number, base: number) => (base > 0 ? (change / base) * 100 : 0);

/** Splits a shekel growth factor into the stock's own move and the dollar's: (1+a)(1+b) = 1+total. */
const splitOf = (stock: number, total: number) => ({
  stock: (stock - 1) * 100,
  dollar: (total / stock - 1) * 100,
});

const signedPct = (n: number) => `${n >= 0.005 ? '+' : n <= -0.005 ? '−' : ''}${Math.abs(n).toFixed(1)}%`;

const lineOf = (market: MarketData, position: Position): Line | null => {
  const row = findRow(market, position.securityId);
  if (!row) return null;
  const us = row.market === 'US';
  const value = toShekels(position.value);
  // What the same shares were worth a day ago, at that day's price and dollar rate.
  const fxMove = us ? (market.usdIlsDayAgo ?? market.usdIls) / market.usdIls : 1;
  const dayAgo = row.price > 0 ? value * (row.priceDayAgo / row.price) * fxMove : value;
  const paid = position.paid ? toShekels(position.paid) : null;
  return {
    id: row.id,
    name: row.name,
    sector: row.sector,
    currency: us ? '$' : '₪',
    shares: toUnits(position.units),
    average: position.averagePrice ? displayPrice(position.averagePrice) : null,
    now: displayPrice(row.price),
    value,
    todayIls: value - dayAgo,
    today: pct(value - dayAgo, dayAgo),
    profit: paid === null ? null : value - paid,
    gain: paid === null ? null : pct(value - paid, paid),
    split:
      us && paid && position.averagePrice ? splitOf(row.price / position.averagePrice, value / paid) : null,
  };
};

const linesOf = (market: MarketData, positions: Position[]) =>
  positions
    .map((p) => lineOf(market, p))
    .filter((l): l is Line => l !== null)
    .sort((a, b) => b.value - a.value);

/** How much all your stocks together moved today, in shekels and percent. */
export function stocksToday(market: MarketData, positions: Position[]) {
  const lines = linesOf(market, positions);
  const change = lines.reduce((sum, l) => sum + l.todayIls, 0);
  const value = lines.reduce((sum, l) => sum + l.value, 0);
  return { ils: change, percent: pct(change, value - change) };
}

const signedIls = (n: number) => {
  const shown = Math.round(n);
  return `${shown > 0 ? '+' : shown < 0 ? '−' : ''}${ils(Math.abs(shown))}`;
};

function Change({ value, amount }: { value: number; amount: number }) {
  const color = changeColor(value);
  return (
    <View style={styles.cell}>
      <Text style={[styles.gain, { color }]}>{percent(value)}</Text>
      <Text style={[styles.small, styles.right, { color }]}>{signedIls(amount)}</Text>
    </View>
  );
}

function SumLine({ label, amount, strong }: { label: string; amount: number; strong?: boolean }) {
  return (
    <View style={styles.sumLine}>
      <Text style={[strong ? styles.name : styles.sumLabel]}>{label}</Text>
      <Text style={[styles.number, strong && styles.bold, { color: changeColor(amount) }]}>
        {signedIls(amount)}
      </Text>
    </View>
  );
}

/** `total` is the whole portfolio in shekels: cash, waiting orders and stocks. */
export function HoldingsTable({
  market,
  positions,
  total,
}: {
  market: MarketData;
  positions: Position[];
  total: number;
}) {
  const wide = useWide();
  const lines = linesOf(market, positions);
  if (lines.length === 0) return null;

  const today = stocksToday(market, positions);
  const known = lines.filter((l) => l.profit !== null);
  const held = known.reduce((sum, l) => sum + (l.profit ?? 0), 0);
  const paid = known.reduce((sum, l) => sum + l.value - (l.profit ?? 0), 0);
  // Every shekel of change since the start is either on a stock you hold or on one you sold, so the
  // rest is what your sales made or lost. Only exact when every holding's cost is known.
  const sinceStart = total - START_SHEKELS;
  const allKnown = known.length === lines.length;
  const sold = sinceStart - held;

  return (
    <Card style={styles.card}>
      <Text style={styles.help}>All profits in ₪. US stocks include the dollar.</Text>

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
        const avg = l.average ? money(l.average, l.currency) : '—';
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
                {l.split ? (
                  <Text style={styles.small}>
                    stock {signedPct(l.split.stock)} · dollar {signedPct(l.split.dollar)}
                  </Text>
                ) : null}
              </View>
            </View>
            {wide ? (
              <>
                <Text style={[styles.number, styles.cell]}>{avg}</Text>
                <Text style={[styles.number, styles.cell]}>{now}</Text>
                <Text style={[styles.number, styles.cell]}>{ils(l.value)}</Text>
              </>
            ) : (
              // On a phone, both prices share one column: now on top, what you paid under it.
              <View style={styles.cell}>
                <Text style={[styles.number, styles.right]}>{now}</Text>
                <Text style={[styles.small, styles.right]}>paid {avg}</Text>
              </View>
            )}
            <Change value={l.today} amount={l.todayIls} />
            {l.gain === null ? (
              <Text style={[styles.small, styles.cell]}>—</Text>
            ) : (
              <Change value={l.gain} amount={l.profit ?? 0} />
            )}
          </Pressable>
        );
      })}

      <View style={[styles.row, styles.totalRow]}>
        <Text style={[styles.name, styles.stock]}>Stocks you hold</Text>
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
        <Change value={today.percent} amount={today.ils} />
        {known.length > 0 ? <Change value={pct(held, paid)} amount={held} /> : <View style={styles.cell} />}
      </View>

      {allKnown ? (
        <View style={styles.sum}>
          <SumLine label="Profit on stocks you hold" amount={held} />
          <SumLine label="Profit on stocks you sold" amount={sold} />
          <View style={styles.sumRule} />
          <View style={styles.sumLine}>
            <Text style={styles.name}>Since you started</Text>
            <Text style={[styles.number, styles.bold, { color: changeColor(sinceStart) }]}>
              {signedIls(sinceStart)} ({percent(pct(sinceStart, START_SHEKELS))})
            </Text>
          </View>
          <Text style={styles.small}>
            Same as the top. The % is out of your ₪{START_SHEKELS.toLocaleString('en-US')} start.
          </Text>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { paddingHorizontal: 16, paddingVertical: 6 },
  flex: { flex: 1, minWidth: 0 },
  help: { color: colors.muted, fontFamily: font.body, fontSize: 13, lineHeight: 19, paddingVertical: 8 },
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
  totalRow: { borderBottomWidth: 2 },
  stock: { flex: 1.5, minWidth: 0 },
  stockCell: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  cell: { alignItems: 'flex-end', flex: 1, textAlign: 'right' },
  right: { textAlign: 'right' },
  bold: { fontWeight: '600' },
  sum: { gap: 6, paddingBottom: 10, paddingTop: 12 },
  sumLine: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  sumLabel: { color: colors.muted, fontFamily: font.body, fontSize: 14 },
  sumRule: { backgroundColor: colors.line, height: 1, marginVertical: 2 },
  name: { color: colors.ink, fontFamily: font.body, fontSize: 15, fontWeight: '500' },
  small: { color: colors.muted, fontFamily: font.body, fontSize: 12, marginTop: 2 },
  number: { color: colors.ink, fontFamily: font.body, fontSize: 14, fontVariant: ['tabular-nums'] },
  gain: { fontFamily: font.body, fontSize: 14, fontVariant: ['tabular-nums'], fontWeight: '600' },
});
