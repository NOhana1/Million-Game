import { StyleSheet, Text, View } from 'react-native';

import { useGame, useLiveWorldTime } from '@/game/store';
import { formatWorldTime, marketsText } from '@/game/view';

import { colors, font } from './ui';

export function OfflineNotice() {
  const { offline } = useGame();
  if (!offline) return null;
  return <Text style={styles.offline}>Can’t reach the server. Retrying…</Text>;
}

export function Brand() {
  return (
    <View style={styles.brandBox}>
      <View style={styles.mark} />
      <Text style={styles.brand}>Portfolio League</Text>
    </View>
  );
}

/** The top of the phone screen. On a computer the top menu shows this instead. */
export function WorldBar() {
  const { world } = useGame();
  const time = useLiveWorldTime();
  return (
    <View style={styles.bar}>
      <Brand />
      {world ? <Text style={styles.time}>{formatWorldTime(time)}</Text> : null}
    </View>
  );
}

export function MenuStatus() {
  const { world } = useGame();
  const time = useLiveWorldTime();
  if (!world) return null;
  return (
    <View style={styles.status}>
      <Text style={styles.statusTime}>{formatWorldTime(time)}</Text>
      <Text style={styles.statusMarkets}>{marketsText(world)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    alignItems: 'center',
    backgroundColor: colors.page,
    borderBottomColor: colors.line,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  brandBox: { alignItems: 'center', flexDirection: 'row', gap: 10, marginRight: 20 },
  mark: { backgroundColor: colors.brass, height: 11, transform: [{ rotate: '45deg' }], width: 11 },
  brand: { color: colors.ink, fontFamily: font.display, fontSize: 21, fontWeight: '500' },
  time: {
    color: colors.onDeep,
    fontFamily: font.body,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  status: { alignItems: 'flex-end', gap: 2, justifyContent: 'center', marginLeft: 'auto' },
  statusTime: {
    color: colors.ink,
    fontFamily: font.body,
    fontSize: 14,
    fontVariant: ['tabular-nums'],
    fontWeight: '500',
  },
  statusMarkets: { color: colors.onDeep, fontFamily: font.body, fontSize: 12 },
  offline: {
    backgroundColor: colors.down,
    color: colors.ink,
    fontFamily: font.body,
    fontSize: 13,
    fontWeight: '600',
    padding: 8,
    textAlign: 'center',
  },
});
