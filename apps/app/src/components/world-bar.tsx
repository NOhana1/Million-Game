import { StyleSheet, Text, View } from 'react-native';

import { displayFx } from '@/game/sim';
import { useGame } from '@/game/store';
import { formatWorldTime, isMarketOpen, Market, MARKET_LABEL } from '@/game/world';

import { Button, colors } from './ui';

function MarketStatus({ market, worldMs }: { market: Market; worldMs: number }) {
  const open = isMarketOpen(market, worldMs);
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
  const { state, dispatch } = useGame();
  return (
    <View style={styles.bar}>
      <View style={styles.row}>
        <Text style={styles.brand}>Portfolio League</Text>
        <Text style={styles.time}>{formatWorldTime(state.worldMs)}</Text>
      </View>
      <View style={styles.row}>
        <View style={styles.statuses}>
          <MarketStatus market="TASE" worldMs={state.worldMs} />
          <MarketStatus market="US" worldMs={state.worldMs} />
          <Text style={styles.statusText}>$1 = ₪{displayFx(state).toFixed(3)}</Text>
        </View>
      </View>
      <View style={styles.adminRow}>
        <Text style={styles.adminLabel}>Admin clock</Text>
        <View style={styles.adminButtons}>
          <Button
            variant="quiet"
            label={state.paused ? 'Resume' : 'Pause'}
            onPress={() => dispatch({ type: 'togglePause' })}
          />
          <Button
            variant="quiet"
            label="Next open/close"
            onPress={() => dispatch({ type: 'skipToNextEvent' })}
          />
        </View>
      </View>
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
  adminRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  adminLabel: { color: colors.muted, fontSize: 13 },
  adminButtons: { flexDirection: 'row', gap: 8 },
});
