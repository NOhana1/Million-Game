import type { Market } from '@portfolio-league/engine';
import { StyleSheet, Text, View } from 'react-native';

import { useGame } from '@/game/store';
import { displayFx, formatWorldTime, MARKET_LABEL } from '@/game/view';

import { colors } from './ui';

function MarketStatus({ market, open }: { market: Market; open: boolean }) {
  return (
    <View style={styles.status}>
      <View style={[styles.dot, { backgroundColor: open ? colors.up : '#A4ADA7' }]} />
      <Text style={styles.statusText}>
        {MARKET_LABEL[market]} {open ? 'open' : 'closed'}
      </Text>
    </View>
  );
}

export function WorldBar() {
  const { world, market, offline } = useGame();
  return (
    <View style={styles.bar}>
      <View style={styles.row}>
        <Text style={styles.brand}>Portfolio League</Text>
        {world ? <Text style={styles.time}>{formatWorldTime(world.worldTime)}</Text> : null}
      </View>
      {world ? (
        <View style={styles.statuses}>
          <MarketStatus market="TASE" open={world.markets.TASE.open} />
          <MarketStatus market="US" open={world.markets.US.open} />
          {market ? (
            <Text style={styles.statusText}>$1 = ₪{displayFx(market.usdIls).toFixed(3)}</Text>
          ) : null}
        </View>
      ) : null}
      {offline ? <Text style={styles.offline}>Can’t reach the server. Retrying…</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.card,
    borderBottomColor: colors.line,
    borderBottomWidth: 1,
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  row: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  brand: { color: colors.brand, fontSize: 18, fontWeight: '800' },
  time: { color: colors.ink, fontSize: 14, fontVariant: ['tabular-nums'], fontWeight: '600' },
  statuses: { alignItems: 'center', columnGap: 14, flexDirection: 'row', flexWrap: 'wrap' },
  status: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  dot: { borderRadius: 4, height: 8, width: 8 },
  statusText: { color: colors.muted, fontSize: 13 },
  offline: { color: colors.down, fontSize: 13, fontWeight: '600' },
});
