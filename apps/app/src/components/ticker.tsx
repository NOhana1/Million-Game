import { Link } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import type { MarketData } from '@/api/client';
import { displayPrice, dayChange } from '@/game/view';

import { changeColor, colors, font, hover, money, percent, useWide } from './ui';

const moving = { dataSet: { tape: 'true' } } as object;

/** The tape across the top of the market. It moves on a computer and scrolls by hand on a phone. */
export function Ticker({ market }: { market: MarketData }) {
  const wide = useWide();
  const items = (copy: string) =>
    market.securities.map((row) => {
      const change = dayChange(row);
      return (
        <Link key={copy + row.id} href={`/security/${row.id}`} {...hover('link')} style={styles.item}>
          <Text style={styles.id}>{row.id}</Text>
          <Text style={styles.price}>
            {'  '}
            {money(displayPrice(row.price), row.market === 'US' ? '$' : '₪')}
          </Text>
          <Text style={[styles.change, { color: changeColor(change) }]}>
            {'  '}
            {percent(change)}
          </Text>
        </Link>
      );
    });

  if (!wide) {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tape}>
        {items('a')}
      </ScrollView>
    );
  }
  return (
    <View style={styles.tape}>
      <View {...moving} style={styles.run}>
        {items('a')}
        {items('b')}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tape: {
    borderBottomColor: colors.line,
    borderBottomWidth: 1,
    flexGrow: 0,
    overflow: 'hidden',
  },
  run: { flexDirection: 'row', width: 'max-content' as unknown as number },
  item: { paddingHorizontal: 16, paddingVertical: 9, whiteSpace: 'nowrap' } as object,
  id: { color: colors.ink, fontFamily: font.body, fontSize: 12, fontWeight: '600', letterSpacing: 0.6 },
  price: { color: colors.muted, fontFamily: font.body, fontSize: 12, fontVariant: ['tabular-nums'] },
  change: { fontFamily: font.body, fontSize: 12, fontVariant: ['tabular-nums'], fontWeight: '500' },
});
