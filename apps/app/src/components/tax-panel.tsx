import { CAPITAL_GAINS_TAX_PERCENT, israelYear, type Sale, taxYears } from '@portfolio-league/engine';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { MarketData } from '@/api/client';
import { Card, changeColor, colors, font, hover, ils } from '@/components/ui';
import { findRow, toShekels } from '@/game/view';

const signedIls = (n: number) => {
  const shown = Math.round(n);
  return `${shown > 0 ? '+' : shown < 0 ? '−' : ''}${ils(Math.abs(shown))}`;
};

const dayFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Jerusalem',
  day: 'numeric',
  month: 'short',
});

/**
 * The tax you would owe on your sales, year by year. Shown only: the game never takes it from your
 * cash. Closed until tapped, and each year opens to list its sales.
 */
export function TaxPanel({ market, sales }: { market: MarketData; sales: Sale[] }) {
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState<number | null>(null);
  const years = taxYears(sales, israelYear);
  const owed = years.reduce((sum, y) => sum + y.tax, 0);

  return (
    <View style={styles.column}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        {...hover('lift')}
        style={styles.toggle}
      >
        <View style={styles.flex}>
          <Text style={styles.title}>Taxes on your sales</Text>
          <Text style={styles.small}>
            {years.length === 0 ? 'Nothing sold yet' : `${ils(toShekels(owed))} so far`}
          </Text>
        </View>
        <Text style={styles.chevron}>{open ? '▴' : '▾'}</Text>
      </Pressable>

      {open ? (
        <Card style={styles.card}>
          <Text style={styles.help}>
            {CAPITAL_GAINS_TAX_PERCENT}% of each year&apos;s profit, after losses. Just for show, the game
            doesn&apos;t take it.
          </Text>

          {years.length === 0 ? (
            <Text style={styles.empty}>Sell a stock and its tax shows up here.</Text>
          ) : (
            <>
              <View style={[styles.row, styles.head]}>
                <Text style={[styles.headText, styles.flex]}>Year</Text>
                <Text style={[styles.headText, styles.cell]}>Profit</Text>
                <Text style={[styles.headText, styles.cell]}>Tax</Text>
              </View>
              {years.map((y) => {
                const shown = year === y.year;
                const list = sales.filter((s) => s.cost !== null && israelYear(s.at) === y.year).reverse();
                return (
                  <View key={y.year}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ expanded: shown }}
                      accessibilityLabel={`${y.year}, ${y.sales} sales`}
                      onPress={() => setYear(shown ? null : y.year)}
                      {...hover('row')}
                      style={styles.row}
                    >
                      <View style={styles.flex}>
                        <Text style={styles.name}>
                          {y.year} {shown ? '▴' : '▾'}
                        </Text>
                        <Text style={styles.small}>
                          {y.sales} {y.sales === 1 ? 'sale' : 'sales'}
                        </Text>
                      </View>
                      <Text style={[styles.number, styles.cell, { color: changeColor(y.net) }]}>
                        {signedIls(toShekels(y.net))}
                      </Text>
                      <Text style={[styles.number, styles.cell, styles.bold]}>{ils(toShekels(y.tax))}</Text>
                    </Pressable>
                    {shown ? (
                      <View style={styles.sales}>
                        {list.map((s) => {
                          const profit = toShekels(s.proceeds - (s.cost ?? 0));
                          return (
                            <View key={s.orderId} style={styles.sale}>
                              <Text style={[styles.small, styles.date]}>{dayFormat.format(s.at)}</Text>
                              <Text numberOfLines={1} style={[styles.saleName, styles.flex]}>
                                {findRow(market, s.securityId)?.name ?? s.securityId}
                              </Text>
                              <Text style={[styles.number, { color: changeColor(profit) }]}>
                                {signedIls(profit)}
                              </Text>
                            </View>
                          );
                        })}
                      </View>
                    ) : null}
                  </View>
                );
              })}
              <View style={[styles.row, styles.total]}>
                <Text style={[styles.name, styles.flex]}>All years</Text>
                <Text style={[styles.number, styles.cell, styles.bold]}>{ils(toShekels(owed))}</Text>
              </View>
            </>
          )}
        </Card>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  column: { gap: 10, width: '100%' },
  flex: { flex: 1, minWidth: 0 },
  toggle: {
    alignItems: 'center',
    backgroundColor: colors.raised,
    borderColor: colors.line,
    borderRadius: 6,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: { color: colors.ink, fontFamily: font.body, fontSize: 16, fontWeight: '600' },
  chevron: { color: colors.muted, fontSize: 16 },
  card: { paddingHorizontal: 16, paddingVertical: 6 },
  help: { color: colors.muted, fontFamily: font.body, fontSize: 13, lineHeight: 19, paddingVertical: 8 },
  empty: { color: colors.muted, fontFamily: font.body, fontSize: 14, paddingVertical: 10 },
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
  cell: { flex: 1, textAlign: 'right' },
  sales: { borderBottomColor: colors.line, borderBottomWidth: 1, gap: 6, paddingBottom: 10, paddingLeft: 12 },
  sale: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  date: { marginTop: 0, width: 52 },
  saleName: { color: colors.ink, fontFamily: font.body, fontSize: 14 },
  bold: { fontWeight: '600' },
  name: { color: colors.ink, fontFamily: font.body, fontSize: 15, fontWeight: '500' },
  small: { color: colors.muted, fontFamily: font.body, fontSize: 12, marginTop: 2 },
  number: { color: colors.ink, fontFamily: font.body, fontSize: 14, fontVariant: ['tabular-nums'] },
});
